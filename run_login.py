import pty
import subprocess
import os

master, slave = pty.openpty()
p = subprocess.Popen(
    ["npx", "@railway/cli", "login", "--browserless"],
    stdin=slave, stdout=slave, stderr=slave, close_fds=True,
    env=dict(os.environ, TERM="xterm")
)
os.close(slave)

with open("output3.txt", "wb") as f:
    while True:
        try:
            data = os.read(master, 1024)
            if not data: break
            f.write(data)
            f.flush()
        except OSError:
            break
