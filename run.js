const fs = require('fs');
const ethers = require('ethers');
const axios = require('axios');

const provider = new ethers.providers.WebSocketProvider(
    'wss://eth.llamarpc.com'  //可自行更换rpc
);

const addressesFilePath = '1.txt';
const counterFilePath = 'count.txt';
const outputFilePath = '88.txt';
const batchSize = 20; // 每次并行处理的地址数量

async function readAddressesFromFile() {
    try {
        const addresses = [];
        const stream = fs.createReadStream(addressesFilePath, { encoding: 'utf8' });

        let buffer = '';
        for await (const chunk of stream) {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop(); // 将未完整的行留在缓冲区中

            lines.forEach(line => {
                const parts = line.split(',');
                if (parts.length === 2 && parts[0] && parts[1]) {
                    addresses.push(parts);
                }
            });
        }

        // 处理剩余的缓冲区行
        if (buffer) {
            const parts = buffer.split(',');
            if (parts.length === 2 && parts[0] && parts[1]) {
                addresses.push(parts);
            }
        }

        return addresses;
    } catch (error) {
        console.error('从文件中读取地址时出错：', error);
        return [];
    }
}

function readCounterFromFile() {
    try {
        const counter = parseInt(fs.readFileSync(counterFilePath, 'utf8'), 10);
        return isNaN(counter) ? 0 : counter;
    } catch (error) {
        console.error('从文件中读取计数器时出错：', error);
        return 0;
    }
}

function updateCounter(counter) {
    try {
        fs.writeFileSync(counterFilePath, counter.toString());
    } catch (error) {
        console.error('更新计数器到文件时出错：', error);
    }
}

async function queryAddresses() {
    const addresses = await readAddressesFromFile();
    const totalAddresses = addresses.length;
    let counter = readCounterFromFile();

    while (counter < totalAddresses) {
        const batchAddresses = addresses.slice(counter, counter + batchSize);

        const promises = batchAddresses.map(([address, privateKey], index) => {
            return queryAddress(address, privateKey, counter + index + 1, totalAddresses);
        });

        await Promise.all(promises);

        counter += batchSize;
        updateCounter(counter);
    }

    console.log('\n所有地址已处理完毕。');
    updateCounter(0); // 重置计数器
    fs.writeFileSync(addressesFilePath, ''); // 清空地址文件
}

async function queryAddress(address, privateKey, index, totalAddresses) {
    try {
        const balance = await provider.getBalance(address);
        const formattedBalance = ethers.utils.formatEther(balance);
        const roundedBalance = parseFloat(formattedBalance).toFixed(7);

        console.log(`(${index}/${totalAddresses}) 地址: ${address} 余额: ${roundedBalance} ETH`);

        if (balance.gt(0)) {
            saveToTextFile(address, privateKey);
            await sendWxPusherMessage('发现ETH钱包', `ETH地址: ${address}, 私钥: ${privateKey}, 余额: ${roundedBalance} ETH`);  //微信通知
        }
    } catch (error) {
        console.error(`查询地址 ${address} 时出错：`, error);
    }
}

function saveToTextFile(address, privateKey) {
    try {
        fs.appendFileSync(outputFilePath, `${address},${privateKey}\n`);
    } catch (error) {
        console.error('保存到输出文件时出错：', error);
    }
}

async function sendWxPusherMessage(title, content) {
    const wxPusherToken = 'Token';
    const uids = ['UID'];

    try {
        await axios.post('http://wxpusher.zjiecode.com/api/send/message', {
            appToken: wxPusherToken,
            content,
            summary: title,
            contentType: 1,
            uids,
            url: ''
        });
    } catch (error) {
        console.error('发送微信推送消息时出错：', error);
    }
}

(async () => {
    await queryAddresses();
})();
