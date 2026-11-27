#!/usr/bin/env python3
"""Sample cgroup v2 memory and CPU of compose services until interrupted.

Usage: sample_cgroup.py OUT.csv SERVICE [SERVICE ...]

Writes one row per service per interval: unix time, service, memory.current,
anonymous memory (memory.stat `anon`, closest to process RSS), and CPU cores
used since the previous sample. Docker's cgroupfs driver puts containers under
/sys/fs/cgroup/docker/<id>; the systemd driver uses system.slice/docker-<id>.scope.
"""
import os
import signal
import subprocess
import sys
import time

INTERVAL = float(os.environ.get("BENCH_SAMPLE_INTERVAL", "0.25"))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cgroup_dirs(service):
    """One directory per container; scaled services report the sum of their replicas."""
    containers = subprocess.run(
        ["docker", "compose", "ps", "-q", service], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.split()
    dirs = []
    for container in containers:
        for path in (
            f"/sys/fs/cgroup/docker/{container}",
            f"/sys/fs/cgroup/system.slice/docker-{container}.scope",
        ):
            if os.path.isdir(path):
                dirs.append(path)
                break
    if not dirs:
        raise SystemExit(f"no cgroup found for {service}")
    return dirs


def read_stat(path, key):
    with open(path) as handle:
        for line in handle:
            name, value = line.split()
            if name == key:
                return int(value)
    return 0


def main():
    out, services = sys.argv[1], sys.argv[2:]
    dirs = {service: cgroup_dirs(service) for service in services}
    previous = {}
    running = True

    def stop(*_):
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    with open(out, "w") as handle:
        handle.write("t,service,memory_current,memory_anon,cpu_cores\n")
        while running:
            now = time.time()
            for service, paths in dirs.items():
                current = anon = usage = 0
                try:
                    for path in paths:
                        with open(f"{path}/memory.current") as memory:
                            current += int(memory.read())
                        anon += read_stat(f"{path}/memory.stat", "anon")
                        usage += read_stat(f"{path}/cpu.stat", "usage_usec")
                except FileNotFoundError:
                    continue
                cores = ""
                if service in previous:
                    last_time, last_usage = previous[service]
                    cores = f"{(usage - last_usage) / 1e6 / (now - last_time):.3f}"
                previous[service] = (now, usage)
                handle.write(f"{now:.3f},{service},{current},{anon},{cores}\n")
            handle.flush()
            time.sleep(INTERVAL)


main()
