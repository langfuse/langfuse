# Patched nodejs RPMs (disabled)

The web and worker images install Node from Red Hat's `nodejs:24` module RPMs,
because only that build links the system OpenSSL and its FIPS provider. When
Red Hat lags behind a Node security release, this directory rebuilds Red Hat's
signed source RPM with the upstream fixes, and the images install the result
until Red Hat ships its own errata.

It is currently disabled: Red Hat's `nodejs:24` passes every check in
`test-node-security-fixes.js`, and the images install it straight from the UBI
repos.

| File                          | Role                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `build.sh`                    | Rebuilds Red Hat's source RPM with the files in `PATCHES`; the header lists each patch and its CVE.               |
| `0002-placeholder.patch`      | Stands in for the upstream fix commits; replace it with one `git format-patch` file per fix.                      |
| `Dockerfile`                  | Builds the RPMs, verifies the fixes and FIPS mode, and packs them into a scratch image.                           |
| `install-nodejs.sh`           | Installs the patched RPMs while they are newer than the repos' `nodejs`, otherwise Red Hat's.                     |
| `test-node-security-fixes.js` | Fails unless the installed Node has every fix. Runs in this image, and in the web and worker images once revived. |

`.github/workflows/nodejs-rpm.yml` builds the image for amd64 and arm64 and
publishes it to `ghcr.io/langfuse/langfuse-nodejs-rpm`. For a worked example,
`git show f0f65b838a -- scripts/docker/nodejs-rpm/` has the last patch set:
four Node 24.22.1 fixes on Red Hat's `nodejs-24.21.0-1`.

## Reviving it

1. **Rebase the build.** In `build.sh`, point `SRPM_NAME`, `SRPM_SHA256` and
   `DIST` at Red Hat's current `nodejs:24` source RPM (keep the `.lf1` suffix
   on `DIST`), replace `0002-placeholder.patch` with the new upstream fixes,
   and list them in `PATCHES` and the header. Update the version in the
   `%changelog` line and the `TAG` in the workflow.
2. **Extend the test.** Add a check to `test-node-security-fixes.js` per fix
   that fails on Red Hat's build and passes on the patched one.
3. **Publish.** Uncomment the `pull_request` and `push` triggers in
   `nodejs-rpm.yml`. A pull request builds and verifies (a cold build takes
   about 70 minutes); merging publishes and prints the digest to pin in the
   job summary.
4. **Install it in both `web/Dockerfile` and `worker/Dockerfile`.** After
   the `MICRO_BASE_IMAGE` arg, add the image line the job summary printed and
   a stage for it:

   ```dockerfile
   ARG NODEJS_RPM_IMAGE=ghcr.io/langfuse/langfuse-nodejs-rpm:<TAG>@sha256:<digest>
   FROM ${NODEJS_RPM_IMAGE} AS nodejs-rpm
   ```

   In the `base` stage, replace the `nodejs` install with this one, which
   installs the patched RPMs and fails the build if Node lacks any fix:

   ```dockerfile
   COPY scripts/docker/nodejs-rpm/install-nodejs.sh scripts/docker/nodejs-rpm/test-node-security-fixes.js /opt/nodejs-rpm/
   RUN --mount=type=bind,from=nodejs-rpm,source=/rpms,target=/tmp/nodejs-rpms \
       dnf -y upgrade && \
       bash /opt/nodejs-rpm/install-nodejs.sh /tmp/nodejs-rpms \
       nodejs nodejs-libs npm nodejs-full-i18n openssl-fips-provider openssl-fips-provider-so && \
       dnf clean all && \
       node /opt/nodejs-rpm/test-node-security-fixes.js
   ```

   In the `rpm-installer` stage, replace the `RUN` with the two
   `dnf --installroot /mnt/rootfs` calls with this one. `install-nodejs.sh`
   only swaps in patched RPMs for packages named on its command line, and
   needs them all in one call; the `rpm --root` check fails the build if the
   runtime image got a different `nodejs` than the tested one:

   ```dockerfile
   RUN --mount=type=bind,from=nodejs-rpm,source=/rpms,target=/tmp/nodejs-rpms \
       NODEJS_INSTALLROOT=/mnt/rootfs bash /opt/nodejs-rpm/install-nodejs.sh /tmp/nodejs-rpms \
       nodejs nodejs-libs npm nodejs-full-i18n openssl-fips-provider openssl-fips-provider-so \
       bash coreutils-single sed \
       tzdata ca-certificates crypto-policies wget && \
       test "$(rpm --root /mnt/rootfs -q nodejs)" = "$(rpm -q nodejs)" && \
       dnf --installroot /mnt/rootfs clean all && \
       rm -rf /mnt/rootfs/var/cache /mnt/rootfs/var/log/dnf*
   ```

## Disabling it again

Once Red Hat ships a newer `nodejs:24`, `install-nodejs.sh` installs it and
logs `Red Hat's nodejs ... is newer than the patched ...`. If the image build
still passes `test-node-security-fixes.js`, undo steps 3 and 4 and keep the
new checks in the test.
