# Deploying GreptimeDB with Docker (Assumed Configuration)

This document outlines the assumed steps to deploy a standalone GreptimeDB instance using Docker. Due to limitations in accessing official documentation, these instructions are based on common practices and conventions.

## Docker Run Command

```bash
docker run -d -p 4000-4003:4000-4003 \
       -v greptimedb_data:/tmp/greptimedb \
       --name greptime \
       greptime/greptimedb standalone start \
       --http-addr 0.0.0.0:4000 \
       --rpc-addr 0.0.0.0:4001 \
       --mysql-addr 0.0.0.0:4002 \
       --postgres-addr 0.0.0.0:4003
```

**Explanation:**

*   `docker run`: The command to create and start a Docker container.
*   `-d`: Runs the container in detached mode (in the background).
*   `-p 4000-4003:4000-4003`: Maps ports 4000 through 4003 on the host to the corresponding ports in the container.
    *   HTTP API: 4000
    *   gRPC: 4001
    *   MySQL: 4002
    *   PostgreSQL: 4003
*   `-v greptimedb_data:/tmp/greptimedb`: Mounts a named Docker volume `greptimedb_data` to `/tmp/greptimedb` inside the container for data persistence. This is a common practice for managing persistent data in Docker.
*   `--name greptime`: Assigns a name to the container for easier management.
*   `greptime/greptimedb`: The assumed name of the GreptimeDB Docker image. **Note: The official image name might be different, e.g., `greptime/greptimedb` or `greptime/greptimedb-standalone`. This should be verified.**
*   `standalone start`: Assumed command to start GreptimeDB in standalone mode. The arguments that follow specify the binding addresses and ports for the different services.
    *   `--http-addr 0.0.0.0:4000`:  Makes the HTTP API accessible on all network interfaces within the container at port 4000.
    *   `--rpc-addr 0.0.0.0:4001`: Makes gRPC accessible on all network interfaces within the container at port 4001.
    *   `--mysql-addr 0.0.0.0:4002`: Makes the MySQL protocol interface accessible on all network interfaces within the container at port 4002.
    *   `--postgres-addr 0.0.0.0:4003`: Makes the PostgreSQL protocol interface accessible on all network interfaces within the container at port 4003.

## Access Details

*   **HTTP API:** `http://<host_ip>:4000`
*   **gRPC:** `<host_ip>:4001`
*   **MySQL Protocol:** Connect using a MySQL client to host `<host_ip>`, port `4002`.
*   **PostgreSQL Protocol:** Connect using a PostgreSQL client to host `<host_ip>`, port `4003`.

Replace `<host_ip>` with the IP address of your Docker host (e.g., `localhost` if running Docker locally).

## Managing the Container

*   **Check if the container is running:**
    ```bash
    docker ps
    ```
*   **View container logs:**
    ```bash
    docker logs greptime
    ```
*   **Stop the container:**
    ```bash
    docker stop greptime
    ```
*   **Start the container:**
    ```bash
    docker start greptime
    ```
*   **Remove the container (after stopping):**
    ```bash
    docker rm greptime
    ```
*   **Remove the data volume (if you want to start fresh):**
    ```bash
    docker volume rm greptimedb_data
    ```

## Important Considerations

*   **Image Name Verification:** The image name `greptime/greptimedb` is an assumption. It's crucial to verify the correct official image name on Docker Hub or through GreptimeDB's official channels if they become accessible. Common alternatives could be `greptime/greptimedb-standalone` or similar.
*   **Configuration Flags:** The `standalone start` command and its arguments (`--http-addr`, `--rpc-addr`, etc.) are based on common patterns for database services. GreptimeDB might use different commands, flags, or a configuration file.
*   **Data Persistence:** Using a named Docker volume like `greptimedb_data` is recommended for managing data persistence. Ensure your Docker environment is configured to handle volumes appropriately.
*   **Official Documentation:** These instructions are a best-effort guide due to inaccessible documentation. **Always prioritize and refer to the official GreptimeDB documentation for accurate, up-to-date, and secure deployment instructions.**

## Next Steps (Verification)

If a Docker environment is available, the next step would be to attempt running this command. Log inspection (`docker logs greptime`) would be crucial to identify any errors related to image name, commands, or configuration flags.
```
