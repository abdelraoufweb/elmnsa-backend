import pty
import subprocess
import os
import sys
import time
import select

master, slave = pty.openpty()
env = dict(os.environ, TERM="xterm-256color")
p = subprocess.Popen(
    ["npx", "@railway/cli", "login", "--browserless"],
    stdin=slave, stdout=slave, stderr=slave, close_fds=True,
    env=env
)
os.close(slave)

output = b""
start = time.time()

with open("/tmp/railway_url.txt", "w") as f:
    f.write("")

# Wait for the URL
while time.time() - start < 30:
    r, _, _ = select.select([master], [], [], 0.5)
    if r:
        try:
            data = os.read(master, 4096)
            if not data:
                break
            output += data
            text = output.decode("utf-8", errors="replace")
            
            # Save all output
            with open("/tmp/railway_url_raw.txt", "w") as f:
                f.write(text)
                
            # Check for URL
            if "https://railway.app/" in text or "https://railway.com/" in text:
                print("FOUND URL")
                break
                
        except OSError:
            break

# Final output
p.kill()
