import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, comment, Dictionary, internal, SendMode, toNano } from '@ton/core';
import { buildVerifyMerkleProof, buildVerifyMerkleUpdate, Exotic } from '../wrappers/Exotic';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { randomAddress } from '@ton/test-utils';

function merkleFixture() {
    const dict = Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.Bool());
    const address = randomAddress();
    dict.set(address, true);
    for (let i = 0; i < 10; i++) {
        dict.set(randomAddress(), true);
    }
    const merkleRoot = beginCell().storeDictDirect(dict).endCell().hash();
    return { dict, address, merkleRoot };
}

function buildSuccessMerkleProof() {
    const { dict, merkleRoot, address } = merkleFixture();
    const merkleProof = dict.generateMerkleProof([address]);
    return { merkleRoot, merkleProof };
}

function buildSuccessMerkleUpdate() {
    const { dict, address, merkleRoot } = merkleFixture();
    const merkleUpdate = dict.generateMerkleUpdate(address, false); // NOTE: this updates dictionary with new value
    return { merkleRoot, merkleUpdate };
}

// const merkleExampleAddress = '...';
//
//
// const merkleProofBody = buildVerifyMerkleProof(buildSuccessMerkleProof());
// const merkleUpdateBody = buildVerifyMerkleUpdate(buildSuccessMerkleUpdate());
//
// const myTransaction = {
//     validUntil: Math.floor(Date.now() / 1000) + 360,
//     messages: [
//         {
//             address: merkleExampleAddress,
//             amount: toNano("0.05").toString(),
//             payload: merkleProofBody.toBoc().toString("base64")
//         }
//     ]
// }
//
// tonConnectUi.sendTransaction(myTransaction)


describe('Exotic', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Exotic');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let owner: SandboxContract<TreasuryContract>;
    let exotic: SandboxContract<Exotic>;

    const commentOk = comment('OK');
    const commentError = comment('ERROR');

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        owner = await blockchain.treasury('owner');
        deployer = await blockchain.treasury('deployer');

        exotic = blockchain.openContract(Exotic.createFromConfig({ owner: owner.address }, code));

        const deployResult = await exotic.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: exotic.address,
            deploy: true,
            success: true,
        });
    });

    it('should verify merkle proof with OK comment', async () => {
        const result = await exotic.sendVerifyMerkleProof(
            deployer.getSender(),
            toNano('0.05'),
            buildSuccessMerkleProof(),
        );

        expect(result.transactions).toHaveTransaction({
            from: exotic.address,
            to: deployer.address,
            body: commentOk,
        });
    });

    it('should verify merkle proof with ERROR comment', async () => {
        const { merkleRoot, address } = merkleFixture();

        const invalidDict = Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.Bool());
        invalidDict.set(address, true);
        const invalidMerkleProof = invalidDict.generateMerkleProof([address]);

        const result = await exotic.sendVerifyMerkleProof(deployer.getSender(), toNano('0.05'), {
            merkleProof: invalidMerkleProof,
            merkleRoot,
        });

        expect(result.transactions).toHaveTransaction({
            from: exotic.address,
            to: deployer.address,
            body: commentError,
        });
    });

    it('should verify merkle update with OK comment', async () => {
        const result = await exotic.sendVerifyMerkleUpdate(
            deployer.getSender(),
            toNano('0.05'),
            buildSuccessMerkleUpdate(),
        );

        expect(result.transactions).toHaveTransaction({
            from: exotic.address,
            to: deployer.address,
            body: commentOk,
        });
    });

    it('should verify merkle update with ERROR comment', async () => {
        const { address, merkleRoot } = merkleFixture();

        const invalidDict = Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.Bool());
        invalidDict.set(address, true);

        const invalidMerkleUpdate = invalidDict.generateMerkleUpdate(address, false);

        const result = await exotic.sendVerifyMerkleUpdate(deployer.getSender(), toNano('0.05'), {
            merkleUpdate: invalidMerkleUpdate,
            merkleRoot,
        });

        expect(result.transactions).toHaveTransaction({
            from: exotic.address,
            to: deployer.address,
            body: commentError,
        });
    });

    it('should send message from owner', async () => {
        const receiver = randomAddress();
        const body = comment('Hello from owner!');

        const result = await exotic.sendFromOwner(owner.getSender(), toNano('0.05'), {
            messages: [internal({ to: receiver, value: 0n, body })],
            mode: SendMode.CARRY_ALL_REMAINING_INCOMING_VALUE,
        });

        expect(result.transactions).toHaveTransaction({
            from: exotic.address,
            to: receiver,
            body,
        });
    });

    it('should NOT send message NOT from owner', async () => {
        const receiver = randomAddress();

        const result = await exotic.sendFromOwner(deployer.getSender(), toNano('0.05'), {
            messages: [internal({ to: receiver, value: 0n })],
            mode: SendMode.CARRY_ALL_REMAINING_INCOMING_VALUE,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: exotic.address,
            exitCode: 0x2001,
            success: false,
        });
    });
});
