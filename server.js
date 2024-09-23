const express = require('express');
const cors = require('cors');
const si = require('systeminformation');

const config = require('./config.json');

const app = express();

let lastNetworkStats = null;
let lastNetworkTime = null;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    const x_api_key = req.headers['x-api-key'];

    if ((!x_api_key || x_api_key !== config.api.key) && config.api.needAuth) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
});

app.get("/performance", async (req, res) => {
    try {
        const [cpu, cpuInfo, mem, currentNetworkStats, fsSize] = await Promise.all([
            si.currentLoad(),
            si.cpu(),
            si.mem(),
            si.networkStats(),
            si.fsSize()
        ]);

        const currentTime = Date.now();
        let networkInPerSecond = 0;
        let networkOutPerSecond = 0;

        if (lastNetworkStats && lastNetworkTime) {
            const timeDiff = (currentTime - lastNetworkTime) / 1000; // Convert to seconds
            networkInPerSecond = (currentNetworkStats[0].rx_bytes - lastNetworkStats[0].rx_bytes) / timeDiff;
            networkOutPerSecond = (currentNetworkStats[0].tx_bytes - lastNetworkStats[0].tx_bytes) / timeDiff;
        }

        lastNetworkStats = currentNetworkStats;
        lastNetworkTime = currentTime;

        // Calculate total storage space and usage
        const totalStorage = fsSize.reduce((acc, drive) => acc + drive.size, 0);
        const usedStorage = fsSize.reduce((acc, drive) => acc + drive.used, 0);
        const freeStorage = totalStorage - usedStorage;
        const usedPercentage = (usedStorage / totalStorage * 100).toFixed(2);
        const freePercentage = (freeStorage / totalStorage * 100).toFixed(2);

        res.json({
            server: {
                name: config.server.name
            },
            cpu: {
                name: `${cpuInfo.manufacturer} ${cpuInfo.brand}`,
                usage: cpu.currentLoad.toFixed(2) + '%',
                cores: cpu.cpus.length
            },
            memory: {
                total: (mem.total / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
                used: (mem.used / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
                free: (mem.free / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
            },
            network: {
                interface: currentNetworkStats[0].iface,
                inputMb: (currentNetworkStats[0].rx_bytes / (1024 * 1024)).toFixed(2) + ' MB',
                outputMb: (currentNetworkStats[0].tx_bytes / (1024 * 1024)).toFixed(2) + ' MB',
                inputPerSecond: (networkInPerSecond / (1024 * 1024)).toFixed(2) + ' MB/s',
                outputPerSecond: (networkOutPerSecond / (1024 * 1024)).toFixed(2) + ' MB/s'
            },
            storage: {
                total: (totalStorage / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
                used: (usedStorage / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
                free: (freeStorage / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
                usedPercentage: usedPercentage + '%',
                freePercentage: freePercentage + '%'
            },
            raw: {
                cpu: {
                    name: `${cpuInfo.manufacturer} ${cpuInfo.brand}`,
                    ...cpu,
                    cpus: cpu.cpus.map((core, index) => ({
                        load: core.load
                    })),
                },
                memory: mem,
                network: {
                    interfaces: currentNetworkStats,
                    lastNetworkStats: lastNetworkStats,
                    lastNetworkTime: lastNetworkTime,
                    networkInPerSecond,
                    networkOutPerSecond,
                },
                storage: {
                    total: totalStorage,
                    used: usedStorage,
                    free: freeStorage,
                }
            },
        });
    } catch (error) {
        console.error('Error fetching PC status:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.use((req, res) => {
    res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

app.listen(3405, () => {
    console.log('Server is running on port 3405');
});