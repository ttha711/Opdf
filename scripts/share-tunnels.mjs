import { spawn, exec } from 'child_process';

const ports = [5174, 5175];
const children = [];

console.log('⚡ Starting Cloudflare Tunnels for ports 5174 and 5175...');

function killProcess(child) {
  if (!child) return;
  try {
    if (process.platform === 'win32') {
      // On Windows, use taskkill to kill the process tree
      exec(`taskkill /pid ${child.pid} /T /F`, (err) => {
        // Ignore error if process already exited
      });
    } else {
      child.kill('SIGTERM');
    }
  } catch (e) {
    // Ignore
  }
}

function cleanup() {
  console.log('\nStopping all tunnels...');
  for (const child of children) {
    killProcess(child);
  }
  process.exit(0);
}

// Handle exit signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', () => {
  for (const child of children) {
    killProcess(child);
  }
});

ports.forEach((port) => {
  // Use npx cloudflared tunnel --url http://127.0.0.1:port
  // shell: true is helpful on Windows for npx resolve
  const child = spawn('npx', ['cloudflared', 'tunnel', '--url', `http://localhost:${port}`], {
    shell: true,
  });

  children.push(child);

  let urlFound = false;

  const handleData = (data) => {
    const text = data.toString();
    // Look for trycloudflare.com link in the log output
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !urlFound) {
      urlFound = true;
      console.log(`\n🎉 Port \x1b[36m${port}\x1b[0m is now public at: \x1b[32m\x1b[1m${match[0]}\x1b[0m`);
    }
  };

  child.stdout.on('data', handleData);
  child.stderr.on('data', handleData);

  child.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`Tunnel for port ${port} exited with code ${code}`);
    }
  });
});
