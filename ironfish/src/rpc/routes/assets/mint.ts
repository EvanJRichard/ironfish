/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
 import * as yup from 'yup'
 import { ERROR_CODES, ValidationError } from '../../adapters'
 import { ApiNamespace, router } from '../router'
 
 export interface MintAssetRequest { 
  metadata: string
  name: string
  value: number
}

 export interface MintAssetResponse {
  assetIdentifier: string
 }
 
 export const MintAssetRequestSchema: yup.ObjectSchema<MintAssetRequest> = yup
   .object({
    metadata: yup.string().required(),
    name: yup.string().required(),
    value: yup.number().required(),
   })
   .defined()
 
 export const MintAssetResponseSchema: yup.ObjectSchema<MintAssetResponse> = yup
   .object({
    assetIdentifier: yup.string().required(),
   })
   .defined()
 
 router.register<typeof MintAssetRequestSchema, MintAssetResponse>(
   `${ApiNamespace.asset}/mint`,
   MintAssetRequestSchema,
   async (request, node): Promise<void> => {
     const account = node.wallet.getDefaultAccount()
     if (!account) {
       throw new ValidationError(
         `No default account`,
         400,
         ERROR_CODES.ERROR,
       )
     }

     const transaction = await node.wallet.mint(node.memPool, account, request.data.name, request.data.metadata, 1e8 * request.data.value)
 
     request.end({
      assetIdentifier: transaction.mints()[0].asset.identifier().toString('hex'),
     })
   },
 )
 