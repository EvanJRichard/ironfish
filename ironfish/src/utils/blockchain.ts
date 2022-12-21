/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { Blockchain } from '../blockchain'
import { Block } from '../primitives'
import { GENESIS_BLOCK_SEQUENCE } from '../primitives/block'
import { BurnDescription } from '../primitives/burnDescription'
import { MintDescription } from '../primitives/mintDescription'
import { IDatabaseTransaction } from '../storage/database/transaction'
import { isTransactionMine } from '../testUtilities/helpers/transaction'
import { Account } from '../wallet'

export function getBlockRange(
  chain: Blockchain,
  range?: {
    start?: number | null
    stop?: number | null
  },
): { start: number; stop: number } {
  const min = Number(GENESIS_BLOCK_SEQUENCE)
  const max = Number(chain.latest.sequence)

  let start = range?.start ? range.start : min
  let stop = range?.stop ? range.stop : max

  // Negative numbers start from the end
  if (start < 0) {
    start = max + start
  }
  if (stop < 0) {
    stop = max + stop
  }

  // Truncate fractions from parameters
  stop = Math.floor(stop)
  start = Math.floor(start)

  // Ensure values are in valid range and start < stop
  start = Math.min(Math.max(start, min), max)
  stop = Math.max(Math.min(Math.max(stop, min), max), start)

  return { start, stop }
}

export function isBlockMine(block: Block, account: Account): boolean {
  return isTransactionMine(block.minersFee, account)
}

/**
 * Creates or updates a mapping of identifier to supply from the asset info DB.
 * Does not update the supply if the identifier already exists in the map.
 */
export async function getAssetSupplies(
  chain: Blockchain,
  mints: Array<MintDescription>,
  burns: Array<BurnDescription>,
  existingSupplyMap?: BufferMap<bigint>,
  tx?: IDatabaseTransaction,
): Promise<BufferMap<bigint>> {
  const supplyMap = existingSupplyMap ?? new BufferMap<bigint>()

  for (const mint of mints) {
    const identifier = mint.asset.identifier()
    if (supplyMap.has(identifier)) {
      continue
    }

    const assetInfo = await chain.assets.get(identifier, tx)
    if (assetInfo) {
      supplyMap.set(identifier, assetInfo.supply)
    }
  }

  for (const burn of burns) {
    const identifier = burn.assetIdentifier
    if (supplyMap.has(identifier)) {
      continue
    }

    const assetInfo = await chain.assets.get(identifier, tx)
    if (assetInfo) {
      supplyMap.set(identifier, assetInfo.supply)
    }
  }

  return supplyMap
}

export const BlockchainUtils = { isBlockMine, getBlockRange, getAssetSupplies }
