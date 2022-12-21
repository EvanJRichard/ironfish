/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::io;

use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use ironfish_zkp::constants::ASSET_IDENTIFIER_LENGTH;

use crate::{
    assets::asset::{AssetIdentifier, MAX_ASSET_VALUE},
    errors::IronfishError,
};

/// Parameters used to build a burn description
pub struct BurnBuilder {
    /// Identifier of the Asset to be burned
    pub asset_identifier: AssetIdentifier,

    /// Amount of asset to burn
    pub value: u64,
}

impl BurnBuilder {
    pub fn new(asset_identifier: AssetIdentifier, value: u64) -> Self {
        Self {
            asset_identifier,
            value,
        }
    }

    pub fn build(&self) -> Result<BurnDescription, IronfishError> {
        let burn = BurnDescription {
            asset_identifier: self.asset_identifier,
            value: self.value,
        };

        burn.partial_verify()?;

        Ok(burn)
    }
}

/// This description represents an action to decrease the supply of an existing
/// asset on Iron Fish
#[derive(Clone)]
pub struct BurnDescription {
    /// Identifier for the Asset which is being burned
    pub asset_identifier: AssetIdentifier,

    /// Amount of asset to burn
    pub value: u64,
}

impl BurnDescription {
    /// This function handles the verification logic. The name is unclear on
    /// burns since they have no proof, but wanted to keep it consistent with
    /// the others until it's abstracted into a trait.
    pub fn partial_verify(&self) -> Result<(), IronfishError> {
        self.verify_value()?;

        Ok(())
    }

    /// Verify that the value of the burn is not greater than the limit
    fn verify_value(&self) -> Result<(), IronfishError> {
        if self.value > MAX_ASSET_VALUE {
            return Err(IronfishError::InvalidBalance);
        }

        Ok(())
    }

    /// Write the signature of this proof to the provided writer.
    ///
    /// The signature is used by the transaction to calculate the signature
    /// hash. Having this data essentially binds the note to the transaction,
    /// proving that it is actually part of that transaction.
    pub(crate) fn serialize_signature_fields<W: io::Write>(
        &self,
        mut writer: W,
    ) -> Result<(), IronfishError> {
        writer.write_all(&self.asset_identifier)?;
        writer.write_u64::<LittleEndian>(self.value)?;

        Ok(())
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let asset_identifier = {
            let mut bytes = [0u8; ASSET_IDENTIFIER_LENGTH];
            reader.read_exact(&mut bytes)?;
            bytes
        };
        let value = reader.read_u64::<LittleEndian>()?;

        Ok(BurnDescription {
            asset_identifier,
            value,
        })
    }

    /// Stow the bytes of this [`BurnDescription`] in the given writer.
    pub fn write<W: io::Write>(&self, writer: W) -> Result<(), IronfishError> {
        self.serialize_signature_fields(writer)?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use crate::{
        assets::asset::{Asset, MAX_ASSET_VALUE},
        transaction::burns::BurnDescription,
        SaplingKey,
    };

    use super::BurnBuilder;

    #[test]
    fn test_burn_builder() {
        let key = SaplingKey::generate_key();
        let owner = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(owner, name, metadata).unwrap();
        let value = MAX_ASSET_VALUE;

        let builder = BurnBuilder::new(asset.identifier, value);

        assert_eq!(builder.value, value);
        assert_eq!(builder.asset_identifier, asset.identifier);

        let burn = builder
            .build()
            .expect("should be able to build a burn description");

        assert_eq!(burn.value, value);
        assert_eq!(burn.asset_identifier, asset.identifier);
    }

    #[test]
    fn test_burn_builder_invalid_value() {
        let key = SaplingKey::generate_key();
        let owner = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(owner, name, metadata).unwrap();
        let value = MAX_ASSET_VALUE + 1;

        let builder = BurnBuilder::new(asset.identifier, value);

        assert_eq!(builder.value, value);
        assert_eq!(builder.asset_identifier, asset.identifier);

        let burn = builder.build();
        assert!(burn.is_err());
    }

    #[test]
    fn test_burn_description_serialization() {
        let key = SaplingKey::generate_key();
        let owner = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(owner, name, metadata).unwrap();
        let value = 5;

        let builder = BurnBuilder::new(asset.identifier, value);
        let burn = builder
            .build()
            .expect("should be able to build a burn description");

        let mut serialized_description = vec![];
        burn.write(&mut serialized_description)
            .expect("should be able to serialize description");

        let deserialized_description = BurnDescription::read(&serialized_description[..])
            .expect("should be able to deserialize valid description");

        assert_eq!(
            burn.asset_identifier,
            deserialized_description.asset_identifier
        );
        assert_eq!(burn.value, deserialized_description.value);

        let mut reserialized_description = vec![];
        deserialized_description
            .write(&mut reserialized_description)
            .expect("should be able to serialize proof again");

        assert_eq!(serialized_description, reserialized_description);
    }
}
