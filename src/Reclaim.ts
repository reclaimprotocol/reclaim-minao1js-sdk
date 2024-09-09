import { Field, SmartContract, Struct, state, State, method, PublicKey, Bytes, Hash, Keccak, EcdsaSignature } from 'o1js';
import * as Claims from './lib/Claims.js';
import { Buffer } from 'buffer'; // Assuming you're working in a Node.js environment
import { Point } from 'o1js/dist/node/lib/provable/gadgets/elliptic-curve.js';

// Mocking the conversion function, replace with actual implementation
function bytesToUInt(bytes: Uint8Array, offset: number): number {
  return Buffer.from(bytes).readUIntBE(offset, bytes.length);
}


class BytesN extends Bytes(1024) {}

let epochs: Claims.Epoch[];

function hashClaimInfo(claimInfo: Claims.ClaimInfo): string {
  const hash_str = BytesN.fromString(
    claimInfo.provider.toString() + 
    '\n' +
    claimInfo.parameters.toString() +
    '\n' +
    claimInfo.context.toString()
  );
  return hash_str.toHex();
}

function fetchEpoch(epoch: number) {
  if (epoch == 0) {
    return epochs[epochs.length - 1];
  }
  return epochs[epoch - 1];
}

function fetchWitnessesForClaim(epoch: number, identifier: string, timestampS: number) {
  let epochData: Claims.Epoch = fetchEpoch(Number(epoch.toString()));
  const hash_str = BytesN.fromString(
    identifier + 
    '\n' +
    epoch.toString() +
    '\n' +
    epochData.minimumWitnessesForClaimCreation.toString() +
    '\n' +
    timestampS.toString()
  );
  const completeHash = Hash.SHA2_256.hash(hash_str);
  let witnessesLeftList = epochData.witnesses;
  let minimumWitnessesForClaimCreation = Number(epochData.minimumWitnessesForClaimCreation.toString());
  let selectedWitnesses: Claims.Witness[] = new Array(minimumWitnessesForClaimCreation);
  let witnessesLeft = witnessesLeftList.length;

  let byteOffset = 0;
  for (let i = 0; i < minimumWitnessesForClaimCreation; i++) {
    const randomSeed = bytesToUInt(completeHash.toBytes(), byteOffset);
    const witnessIndex = randomSeed % witnessesLeft;
    selectedWitnesses[i] = witnessesLeftList[witnessIndex];
    witnessesLeftList[witnessIndex] = epochData.witnesses[witnessesLeft - 1];
    byteOffset = (byteOffset + 4) % completeHash.length;
    witnessesLeft -= 1;
  }
  return selectedWitnesses;
}

function serialise(self: Claims.CompleteClaimData) {
  return BytesN.fromString(
    self.identifier + '\n' +
    self.owner.toBase58() + '\n' +
    self.timestampS.toString() + '\n' +
    self.epoch
  );
}
function verifySignature(serialised: string, signature: string, address: PublicKey): boolean {
  const signedHash = Keccak.ethereum(Bytes.fromString(
    "\x19Ethereum Signed Message:\n" + 
    serialised.length.toString() + 
    serialised
  ));
  const ecdsaSignature = EcdsaSignature.fromHex(signature);

  const addressString = address.toBase58();
  const xBytes = addressString.slice(0, 32);
  const yBytes = addressString.slice(32);

  const x = BigInt(xBytes); // Convert from hex to decimal
  const y = BigInt(yBytes); // Convert from hex to decimal
  return ecdsaSignature.verifySignedHash(BigInt(signedHash.toHex()), Point.from({x, y})).toBoolean();
}

function verifySignerOfSignedCLaim(signedClaim: Claims.SignedClaim, expectedWitnesses: Claims.Witness[]): boolean {
  const serialised = serialise(signedClaim.claim);
  const signers: PublicKey[] = new Array(signedClaim.signatures.length);
  if (signers.length != expectedWitnesses.length) {
    return false;
  }
  for (let i = 0; i < signedClaim.signatures.length; i++) {
    for (let j = 0; j < expectedWitnesses.length; j++) {
      const result = verifySignature(serialised.toHex(), signedClaim.signatures[i].toString(), expectedWitnesses[j].addr);
      if (result == true)
        return true;
    }
  }
  return false;
}


export class Reclaim extends SmartContract {
  @state(Field) currentEpoch = State<Field>();
  @state(Field) epochDurationS = State<Field>();

  init() {
    super.init();
    this.currentEpoch.set(Field(0));
    this.epochDurationS.set(Field(86400)); // 1 day
  }

  @method async verifyProof(proof: Claims.Proof) {
    Field(proof.signedClaim.signatures.length).assertGreaterThan(0);
    const hashed = hashClaimInfo(proof.claimInfo);
    Field(proof.signedClaim.claim.identifier).equals(hashed);
    const expectedWitnesses = fetchWitnessesForClaim(
      Number(proof.signedClaim.claim.epoch.toBigInt()),
      proof.signedClaim.claim.identifier.toString(),
      Number(proof.signedClaim.claim.timestampS.toBigInt())
    )
    const result = verifySignerOfSignedCLaim(proof.signedClaim, expectedWitnesses);
    Field(Number(result)).assertEquals(1);
  }

  @method async addNewEpoch(witnesses: Witness[], requisiteWitnessesForClaimCreate: number) {
    if (this.epochDurationS.get() == Field(0)) {
      this.epochDurationS.set(Field(86400));
    }
    if (epochs.length > 0) {
      epochs[epochs.length - 1].timestampEnd = Field(this.network.timestamp.get().toString());
    }

    this.currentEpoch.set(this.currentEpoch.get().add(1));
    let epoch = new Claims.Epoch({
        id : this.currentEpoch.get(),
        timestampStart : Field(this.network.timestamp.get().toString()),
        timestampEnd : Field(Number(this.network.timestamp.get()) + Number(this.epochDurationS.get())),
        minimumWitnessesForClaimCreation : Field(requisiteWitnessesForClaimCreate.toString()),
        witnesses: []
      }
    );

    for (let i = 0; i < witnesses.length; i++) {
      epoch.witnesses.push(witnesses[i]);
    }
  }
}
