/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
 import { CliUx, Flags } from '@oclif/core'
 import { IronfishCommand } from '../../command'
 import { RemoteFlags } from '../../flags'
 import { ProgressBar } from '../../types'
 
 export class Mint extends IronfishCommand {
   static description = `Send coins to another account`
 
   static examples = [
     '$ ironfish mint:pay -m "see more" -n mycoin -a 1000',
   ]
 
   static flags = {
     ...RemoteFlags,
     amount: Flags.integer({
       char: 'a',
       description: 'Amount of coins to mint',
     }),
     metadata: Flags.string({
       char: 'm',
       description: 'Metadata for the asset',
     }),
     name: Flags.string({
       char: 'n',
       description: 'Name for the asset',
     }),
   }
 
   async start(): Promise<void> {
     const { flags } = await this.parse(Mint)
     let metadata = flags.metadata ?? ''
     let name = flags.name ?? ''
     let amount = flags.amount ?? 0
      const client = await this.sdk.connectRpc(false, true)
 
     const status = await client.getNodeStatus()
     if (!status.content.blockchain.synced) {
       this.log(
         `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
       )
       this.exit(1)
     }
 
     const bar = CliUx.ux.progress({
       barCompleteChar: '\u2588',
       barIncompleteChar: '\u2591',
       format: 'Creating the transaction: [{bar}] {percentage}% | ETA: {eta}s',
     }) as ProgressBar
 
     bar.start()
 
     let value = 0
     const timer = setInterval(() => {
       value++
       bar.update(value)
       if (value >= bar.getTotal()) {
         bar.stop()
       }
     }, 1000)
 
     const stopProgressBar = () => {
       clearInterval(timer)
       bar.update(100)
       bar.stop()
     }
 
     try {
       const result = await client.mintAsset({
       metadata,
       name,
       value: amount,
       })
 
       stopProgressBar()
 
       const response = result.content
       this.log(`
 Minted asset ${response.assetIdentifier}
 Value: ${amount}`)
     } catch (error: unknown) {
       stopProgressBar()
       this.log(`An error occurred while minting the asset.`)
       if (error instanceof Error) {
         this.error(error.message)
       }
       this.exit(2)
     }
   }
 }
 