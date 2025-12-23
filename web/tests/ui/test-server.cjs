#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT_FILE = path.join(__dirname, '.test-port');
const PID_FILE = path.join(__dirname, '.test-pid');

// Find an available port
function findAvailablePort() {
    const net = require('net');
    return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(0, () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

async function startServer() {
    const port = await findAvailablePort();
    console.log(`🚀 Starting Lodestarr server on port ${port}...`);

    // Path to binary - go up from tests/ui to web to root
    const binaryPath = path.resolve(__dirname, '../../../target/release/lodestarr');

    // Check if binary exists
    if (!fs.existsSync(binaryPath)) {
        console.error('❌ Lodestarr binary not found. Run: cargo build --release');
        process.exit(1);
    }

    // Start server
    const server = spawn(binaryPath, ['serve', '--port', port.toString()], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true
    });

    // Save port and PID
    fs.writeFileSync(PORT_FILE, port.toString());
    fs.writeFileSync(PID_FILE, server.pid.toString());

    // Wait for server to be ready
    await new Promise((resolve) => {
        let checkInterval;
        let timeoutHandle;

        checkInterval = setInterval(async () => {
            try {
                const http = require('http');
                const req = http.get(`http://localhost:${port}/api/info`, (res) => {
                    if (res.statusCode === 200) {
                        clearInterval(checkInterval);
                        clearTimeout(timeoutHandle);
                        console.log(`✅ Server ready on http://localhost:${port}`);
                        resolve();
                        // Exit so npm can proceed to run tests
                        process.exit(0);
                    }
                });
                req.on('error', () => { }); // Ignore connection errors while waiting
                req.end();
            } catch (e) { }
        }, 500);

        // Timeout after 10 seconds
        timeoutHandle = setTimeout(() => {
            clearInterval(checkInterval);
            console.error('❌ Server failed to start within 10 seconds');
            process.exit(1);
        }, 10000);
    });

    // Detach so it keeps running
    server.unref();
}

async function stopServer() {
    if (!fs.existsSync(PID_FILE)) {
        console.log('ℹ️  No server PID file found');
        return;
    }

    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
    console.log(`🛑 Stopping server (PID: ${pid})...`);

    try {
        // Kill the entire process group since server was detached
        process.kill(-pid, 'SIGTERM');
        console.log('✅ Server stopped');
    } catch (e) {
        // Try regular kill if process group kill fails
        try {
            process.kill(pid, 'SIGKILL');
            console.log('✅ Server force stopped');
        } catch (e2) {
            console.log('ℹ️  Server already stopped');
        }
    }

    // Cleanup files
    if (fs.existsSync(PORT_FILE)) fs.unlinkSync(PORT_FILE);
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
}

// Handle command
const command = process.argv[2];
if (command === 'start') {
    startServer().catch(err => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });
} else if (command === 'stop') {
    stopServer();
} else {
    console.log('Usage: node test-server.js [start|stop]');
    process.exit(1);
}
