import { toNano } from '@ton/core';
import { Exotic } from '../wrappers/Exotic';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const exotic = provider.open(
        Exotic.createFromConfig(
            {
                owner: provider.sender().address!,
            },
            await compile('Exotic'),
        ),
    );

    await exotic.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(exotic.address);
}
