/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useMinersTxFixture,
  useRawTxFixture,
} from '../../testUtilities'
import {
  PostTransactionRequest,
  PostTransactionResponse,
  PostTransactionTask,
} from './postTransaction'

describe('PostTransactionRequest', () => {
  const nodeTest = createNodeTest()

  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const account = await useAccountFixture(nodeTest.wallet)

    const block = await useMinerBlockFixture(
      nodeTest.chain,
      undefined,
      account,
      nodeTest.wallet,
    )
    await expect(nodeTest.chain).toAddBlock(block)
    await nodeTest.wallet.updateHead()

    const raw = await useRawTxFixture({
      wallet: nodeTest.wallet,
      from: account,
      fee: 1n,
      expiration: 5,
    })

    const request = new PostTransactionRequest(raw)
    const buffer = request.serialize()
    const deserialized = PostTransactionRequest.deserialize(request.jobId, buffer)

    expect(deserialized).toEqual(request)
  })
})

describe('PostTransactionResponse', () => {
  const nodeTest = createNodeTest()

  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const transaction = await useMinersTxFixture(nodeTest.wallet)

    const response = new PostTransactionResponse(transaction, 0)
    const serialized = response.serialize()

    const deserialized = PostTransactionResponse.deserialize(response.jobId, serialized)
    expect(deserialized.transaction.equals(transaction)).toBe(true)
  })
})

describe('PostTransactionTask', () => {
  const nodeTest = createNodeTest()

  it('creates the transaction', async () => {
    const account = await useAccountFixture(nodeTest.wallet)

    const block = await useMinerBlockFixture(
      nodeTest.chain,
      undefined,
      account,
      nodeTest.wallet,
    )
    await expect(nodeTest.chain).toAddBlock(block)
    await nodeTest.wallet.updateHead()

    const raw = await useRawTxFixture({
      wallet: nodeTest.wallet,
      from: account,
      fee: 5n,
      expiration: 9,
    })

    const request = new PostTransactionRequest(raw)
    const task = new PostTransactionTask()
    const response = task.execute(request)

    expect(response.transaction.fee()).toEqual(5n)
    expect(response.transaction.expirationSequence()).toEqual(9)
  })
})
