import { Reclaim } from './Reclaim';
import { Field, Mina, PrivateKey, PublicKey, AccountUpdate, Proof } from 'o1js';
import * as Claims from './lib/Claims.js';

let proofsEnabled = false;

describe('Reclaim', () => {
  let deployerAccount: Mina.TestPublicKey,
    deployerKey: PrivateKey,
    senderAccount: Mina.TestPublicKey,
    senderKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: Reclaim;

  beforeAll(async () => {
    if (proofsEnabled) await Reclaim.compile();
  });

  beforeEach(async () => {
    const Local = await Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    [deployerAccount, senderAccount] = Local.testAccounts;
    deployerKey = deployerAccount.key;
    senderKey = senderAccount.key;

    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new Reclaim(zkAppAddress);
  });

  async function localDeploy() {
    const txn = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      await zkApp.deploy();
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey]).send();
  }

  it('verifies proof', async () => {
    await localDeploy();

    const owner = "0xe4c20c9f558160ec08106de300326f7e9c73fb7f"

    const claimInfo = new Claims.ClaimInfo({
        provider: Field("http"),
        parameters: Field("{\"body\":\"\",\"geoLocation\":\"in\",\"method\":\"GET\",\"responseMatches\":[{\"type\":\"contains\",\"value\":\"_steamid\\\">Steam ID: 76561199632643233</div>\"}],\"responseRedactions\":[{\"jsonPath\":\"\",\"regex\":\"_steamid\\\">Steam ID: (.*)</div>\",\"xPath\":\"id(\\\"responsive_page_template_content\\\")/div[@class=\\\"page_header_ctn\\\"]/div[@class=\\\"page_content\\\"]/div[@class=\\\"youraccount_steamid\\\"]\"}],\"url\":\"https://store.steampowered.com/account/\"}"),
        context: Field("{\"contextAddress\":\"user's address\",\"contextMessage\":\"for acmecorp.com on 1st january\"}"),
    });

    console.log(claimInfo);
    const signedClaim = {
        "claim": {
            "identifier": "0x531322a6c34e5a71296a5ee07af13f0c27b5b1e50616f816374aff6064daaf55", // Keccak256 hash
            "owner": PublicKey.fromBase58(owner),
            "epoch": 1,
            "timestampS": 1710157447
        },
        "signatures": ["0x52e2a591f51351c1883559f8b6c6264b9cb5984d0b7ccc805078571242166b357994460a1bf8f9903c4130f67d358d7d6e9a52df9a38c51db6a10574b946884c1b"],
    }


    const proof: Claims.Proof = new Claims.Proof({
      claimInfo,
      signedClaim
    });;

    const num = zkApp.verifyProof;
    expect(num).toEqual(Field(1));
  });

  // it('correctly updates the num state on the `Reclaim` smart contract', async () => {
  //   await localDeploy();

  //   // update transaction
  //   const txn = await Mina.transaction(senderAccount, async () => {
  //     await zkApp.update();
  //   });
  //   await txn.prove();
  //   await txn.sign([senderKey]).send();

  //   const updatedNum = zkApp.num.get();
  //   expect(updatedNum).toEqual(Field(3));
  // });
});
