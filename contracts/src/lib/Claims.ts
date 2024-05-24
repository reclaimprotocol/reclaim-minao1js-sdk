import { Provable, PublicKey, Struct, Bytes, Field, Character } from 'o1js';

class Bytes1024 extends Bytes(1024) {}

export class ClaimInfo extends Struct({
    provider: Field,
    parameters: Field,
    context: Field,
}) {}

export class CompleteClaimData extends Struct({
    identifier: Field,
    owner: PublicKey,
    timestampS: Field,
    epoch: Field,
}) {}

export class SignedClaim extends Struct({
    claim: CompleteClaimData,
    signatures: Provable.Array(Field, 3),
}) {}

export class Proof extends Struct({
    claimInfo: ClaimInfo,
    signedClaim: SignedClaim,
}) {}

export class Witness extends Struct({
    addr: PublicKey,
    host: Field,
}) {}

export class Epoch extends Struct({
    id: Field,
    timestampStart: Field,
    timestampEnd: Field,
    witnesses: Provable.Array(Witness, 3),
    minimumWitnessesForClaimCreation: Field
}) {}
