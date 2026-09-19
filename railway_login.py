import pty
import subprocess
import os
import sys
import time
import select

master, slave = pty.openpty()
env = dict(os.environ, TERM="xterm-256color")
p = subprocess.Popen(
    ["npx", "@railway/cli", "login"],
    stdin=slave, stdout=slave, stderr=slave, close_fds=True,
    env=env
)
os.close(slave)

output = b""
start = time.time()

# Wait for the "Open the browser?" prompt then send "Y\n"
sent_yes = False
while time.time() - start < 120:
    r, _, _ = select.select([master], [], [], 0.5)
    if r:
        try:
            data = os.read(master, 4096)
            if not data:
                break
            output += data
            text = output.decode("utf-8", errors="replace")
            
            # Write all output to file for monitoring
            with open("/tmp/railway_login_live.txt", "w") as f:
                f.write(text)
            
            # When asked to open browser, send Yes
            if not sent_yes and "Open the browser?" in text:
                time.sleep(0.5)
                os.write(master, b"\n")  # Press enter (Yes is default)
                sent_yes = True
                print(">>> Sent YES to open browser")
            
            # Check for success
            if "Logged in" in text or "logged in" in text or "Successfully" in text:
                print(">>> LOGIN SUCCESSFUL!")
                break
                
            # Check for failure
            if "does not exist" in text:
                print(">>> Login session failed")
                break
                
        except OSError:
            break
    
    # Check if process ended
    if p.poll() is not None:
        break

# Final output
with open("/tmp/railway_login_live.txt", "w") as f:
    f.write(output.decode("utf-8", errors="replace"))

print("\n=== Final Output ===")
print(output.decode("utf-8", errors="replace")[-500:])
print(f"\nProcess exit code: {p.poll()}")
