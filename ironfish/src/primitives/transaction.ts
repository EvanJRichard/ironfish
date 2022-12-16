/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  Asset,
  ASSET_IDENTIFIER_LENGTH,
  ASSET_LENGTH,
  ENCRYPTED_NOTE_LENGTH,
  PROOF_LENGTH,
  TransactionPosted,
} from '@ironfish/rust-nodejs'
import { blake3 } from '@napi-rs/blake-hash'
import bufio from 'bufio'
import { BurnDescription } from './burnDescription'
import { MintDescription } from './mintDescription'
import { NoteEncrypted } from './noteEncrypted'
import { Spend } from './spend'

export type TransactionHash = Buffer

export type SerializedTransaction = Buffer

export class Transaction {
  private readonly transactionPostedSerialized: Buffer

  public readonly notes: NoteEncrypted[]
  public readonly spends: Spend[]
  public readonly mints: MintDescription[]
  public readonly burns: BurnDescription[]

  private readonly _version: number
  private readonly _fee: bigint
  private readonly _expirationSequence: number
  private readonly _sender: string
  private readonly _signature: Buffer
  private _hash?: TransactionHash
  private _unsignedHash?: TransactionHash

  private transactionPosted: TransactionPosted | null = null
  private referenceCount = 0

  constructor(transactionPostedSerialized: Buffer) {
    this.transactionPostedSerialized = transactionPostedSerialized

    const reader = bufio.read(this.transactionPostedSerialized, true)

    this._version = reader.readU8() // 1
    const _spendsLength = reader.readU64() // 8
    const _notesLength = reader.readU64() // 8
    const _mintsLength = reader.readU64() // 8
    const _burnsLength = reader.readU64() // 8
    this._fee = BigInt(reader.readI64()) // 8
    this._expirationSequence = reader.readU32() // 4

    this.spends = Array.from({ length: _spendsLength }, () => {
      // proof
      reader.seek(PROOF_LENGTH)
      // value commitment
      reader.seek(32)
      // randomized public key
      reader.seek(32)

      const rootHash = reader.readHash() // 32
      const treeSize = reader.readU32() // 4
      const nullifier = reader.readHash() // 32

      // signature
      reader.seek(64)

      // total serialized size: 192 + 32 + 32 + 32 + 4 + 32 + 64 = 388 bytes
      return {
        size: treeSize,
        commitment: rootHash,
        nullifier,
      }
    })

    this.notes = Array.from({ length: _notesLength }, () => {
      // proof
      reader.seek(PROOF_LENGTH)

      const note = new NoteEncrypted(reader.readBytes(ENCRYPTED_NOTE_LENGTH, true))
      // TODO(joe): remove once rpk removed from proof and put on transaction
      // randomized public key
      // reader.seek(32)
      return note
    })

    this.mints = Array.from({ length: _mintsLength }, () => {
      // proof
      reader.seek(192)

      const asset = Asset.deserialize(reader.readBytes(ASSET_LENGTH))
      const value = reader.readBigU64()

      // value commitment
      reader.seek(32)
      // randomized public key
      reader.seek(32)
      // authorizing signature
      reader.seek(64)

      return { asset, value }
    })

    this.burns = Array.from({ length: _burnsLength }, () => {
      const assetIdentifier = reader.readBytes(ASSET_IDENTIFIER_LENGTH)
      const value = reader.readBigU64()

      // value commitment
      reader.seek(32)

      return { assetIdentifier, value }
    })

    // sender address
    // TODO(joe): read from bytes rather than hardcoded value
    // this._sender = reader.readBytes(PUBLIC_ADDRESS_LENGTH, true).toString('hex')
    this._sender = '8a4685307f159e95418a0dd3d38a3245f488c1baf64bc914f53486efd370c563'
    this._signature = reader.readBytes(64, true)
  }

  serialize(): Buffer {
    return this.transactionPostedSerialized
  }

  /**
   * The transaction serialization version. This can be incremented when
   * changes need to be made to the transaction format
   */
  version(): number {
    return this._version
  }

  /**
   * Preallocate any resources necessary for using the transaction.
   */
  takeReference(): TransactionPosted {
    this.referenceCount++
    if (this.transactionPosted === null) {
      this.transactionPosted = new TransactionPosted(this.transactionPostedSerialized)
    }
    return this.transactionPosted
  }

  /**
   * Return any resources necessary for using the transaction.
   */
  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.transactionPosted = null
    }
  }

  /**
   * Wraps the given callback in takeReference and returnReference.
   */
  withReference<R>(callback: (transaction: TransactionPosted) => R): R {
    const transaction = this.takeReference()

    const result = callback(transaction)

    Promise.resolve(result).finally(() => {
      this.returnReference()
    })

    return result
  }

  sender(): string {
    return this._sender
  }

  isMinersFee(): boolean {
    return this.spends.length === 0 && this.notes.length === 1 && this._fee <= 0
  }

  getNote(index: number): NoteEncrypted {
    return this.notes[index]
  }

  getSpend(index: number): Spend {
    return this.spends[index]
  }

  /**
   * Get the transaction fee for this transactions.
   *
   * In general, each transaction has outputs lower than the amount spent; the
   * miner can collect the difference as a transaction fee.
   *
   * In a block header's minersFee transaction, the opposite happens;
   * the miner creates a block with zero spends and output equal to the sum
   * of the miner's fee for the block's transaction, plus the block chain's
   * mining reward.
   *
   * The transaction fee is the difference between outputs and spends on the
   * transaction.
   */
  fee(): bigint {
    return this._fee
  }

  /**
   * Get transaction signature for this transaction.
   */
  transactionSignature(): Buffer {
    return this._signature
  }

  /**
   * Get the transaction hash that does not include the signature. This is the hash that
   * is signed when the transaction is created
   */
  unsignedHash(): TransactionHash {
    this._unsignedHash = this._unsignedHash || this.withReference((t) => t.hash())
    return this._unsignedHash
  }

  /**
   * Generate the hash of a transaction that includes the witness (signature) data.
   * Used for cases where a signature needs to be committed to in the hash like P2P transaction gossip
   */
  hash(): TransactionHash {
    this._hash = this._hash || blake3(this.transactionPostedSerialized)
    return this._hash
  }

  equals(other: Transaction): boolean {
    return this.transactionPostedSerialized.equals(other.transactionPostedSerialized)
  }

  expirationSequence(): number {
    return this._expirationSequence
  }
}
