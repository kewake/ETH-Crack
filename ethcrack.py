from web3 import Web3, HTTPProvider
from eth_account import Account
import requests
import multiprocessing
import threading
import random
import sys
import time

# 配置多个以太坊节点的 HTTP Provider 列表
rpc_nodes = [
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
    'https://eth-mainnet.public.blastapi.io',
    'https://rpc.flashbots.net/',
    'https://cloudflare-eth.com/',
    'https://ethereum.publicnode.com',
    'https://nodes.mewapi.io/rpc/eth',
    # Add more RPC nodes here as needed
]

# 随机选择节点
def get_rpc_node():
    return random.choice(rpc_nodes)

# 初始化以太坊节点的 Web3 对象
def initialize_web3():
    rpc_node = get_rpc_node()
    return Web3(HTTPProvider(rpc_node))

# 保存有余额的钱包到文件
def save_to_text_file(address, private_key, filename):
    with open(filename, 'a') as f:
        f.write(f"{address},{private_key}\n")

# 发送微信通知
def send_wx_pusher_message(address, private_key):
    title = '发现ETH钱包'
    content = f"ETH地址: {address}, 私钥: {private_key}"
    wx_pusher_token = 'YOURTOKEN'   #微信通知的token
    uids = ['YOURUID']      #微信通知的UID
    url = 'http://wxpusher.zjiecode.com/api/send/message'

    payload = {
        'appToken': wx_pusher_token,
        'content': content,
        'summary': title,
        'contentType': 1,
        'uids': uids,
        'url': ''
    }

    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"发送微信推送消息时出错: {e}")

# 生成钱包并查询余额的任务
def generate_wallet_and_check_balance(total_queries, filename):
    num_threads = 20 # 调整每个cpu核心的并发数
    threads = []

    def thread_task():
        w3 = initialize_web3()  # 初始化当前进程所选择的以太坊节点
        while True:
            try:
                account = Account.create()
                address = account.address
                private_key = account.key.hex()

                balance = w3.eth.get_balance(address)
                formatted_balance = w3.from_wei(balance, 'ether')

            # 输出钱包信息和查询次数
                print(f"总查询次数: {total_queries.value}，地址: {address}，余额: {formatted_balance} ETH")

                if balance > 0:
                    save_to_text_file(address, private_key, filename)
                    send_wx_pusher_message(address, private_key)    #如果不想要微信通知可以注释掉这一行

                # 增加查询次数
                with total_queries.get_lock():
                    total_queries.value += 1

            except Exception as e:
                print(f"发生未知错误: {e}. 重新获取节点.")
                w3 = initialize_web3()  # 初始化当前进程所选择的以太坊节点
                continue  # 如发生错误重新获取节点继续执行

    for _ in range(num_threads):
        thread = threading.Thread(target=thread_task)
        thread.daemon = True  # 将线程设置为守护线程
        threads.append(thread)
        thread.start()

    for thread in threads:
        thread.join()

# 主函数，利用多进程并行生成钱包并查询余额
def main():
    try:
        num_processes = multiprocessing.cpu_count() # 获取可用的 CPU 核心数
        total_queries = multiprocessing.Value('i', 1) # 创建一个共享的计数器，初始值为1

        processes = []
        filename = '88.txt'

        ctx = multiprocessing.get_context('spawn' if sys.platform == 'win32' else 'fork')

        for i in range(num_processes):
            process = ctx.Process(target=generate_wallet_and_check_balance, args=(total_queries, filename))
            processes.append(process)
            process.start()

        for process in processes:
            process.join()

    except Exception as e:
        print(f"程序运行时出现错误: {e}")

if __name__ == "__main__":
    main()