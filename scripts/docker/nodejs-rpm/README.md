# Patched nodejs RPMs (disabled)

The web and worker images install Node from Red Hat's `nodejs:24` module RPMs,
because only that build links the system OpenSSL and its FIPS provider. When
Red Hat lags behind a Node security release, this directory rebuilds Red Hat's
signed source RPM with the upstream fixes, and the images install the result
until Red Hat ships its own errata.

It is currently disabled: Red Hat's `nodejs:24` passes every check in
`test-node-security-fixes.js`, and the images install it straight from the UBI
repos. The images still run that test, so a build fails if the installed Node
loses one of those fixes.

| File                          | Role                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `build.sh`                    | Rebuilds Red Hat's source RPM with the `000*.patch` files; the header lists each patch and its CVE. |
| `000*.patch`                  | Upstream fix commits, vendored verbatim with `git format-patch`.                                    |
| `Dockerfile`                  | Builds the RPMs, verifies the fixes and FIPS mode, and packs them into a scratch image.             |
| `install-nodejs.sh`           | Installs the patched RPMs while they are newer than the repos' `nodejs`, otherwise Red Hat's.       |
| `test-node-security-fixes.js` | Fails unless the installed Node has every fix. Runs in this image and in the web and worker images. |

`.github/workflows/nodejs-rpm.yml` builds the image for amd64 and arm64 and
publishes it to `ghcr.io/langfuse/langfuse-nodejs-rpm`. The last published
patches target Red Hat's `nodejs-24.21.0-1` and are kept as a worked example.

## Reviving it

1. **Rebase the build.** In `build.sh`, point `SRPM_NAME`, `SRPM_SHA256` and
   `DIST` at Red Hat's current `nodejs:24` source RPM (keep the `.lf1` suffix
   on `DIST`), and replace `PATCHES` and the `000*.patch` files with the new
   upstream fixes. Update the `%changelog` line and the `TAG` in the workflow.
2. **Extend the test.** Add a check to `test-node-security-fixes.js` per fix
   that fails on Red Hat's build and passes on the patched one.
3. **Publish.** Uncomment the `pull_request` and `push` triggers in
   `nodejs-rpm.yml`. A pull request builds and verifies (a cold build takes
   about 70 minutes); merging publishes and prints the digest to pin in the
   job summary.
4. **Install it in both `web/Dockerfile` and `worker/Dockerfile`.** Uncomment
   the `nodejs-rpm` stage with the new digest, then replace the `nodejs`
   install in the `base` stage with:

   ```dockerfile
   COPY scripts/docker/nodejs-rpm/install-nodejs.sh scripts/docker/nodejs-rpm/test-node-security-fixes.js /opt/nodejs-rpm/
   RUN --mount=type=bind,from=nodejs-rpm,source=/rpms,target=/tmp/nodejs-rpms \
       dnf -y upgrade && \
       bash /opt/nodejs-rpm/install-nodejs.sh /tmp/nodejs-rpms \
       nodejs nodejs-libs npm nodejs-full-i18n openssl-fips-provider openssl-fips-provider-so && \
       dnf clean all && \
       node /opt/nodejs-rpm/test-node-security-fixes.js
   ```

   and the two `dnf --installroot /mnt/rootfs` calls in the `rpm-installer`
   stage with one call that passes every package (install-nodejs.sh explains
   why), keeping the rest of that `RUN` as is:

   ```dockerfile
   RUN --mount=type=bind,from=nodejs-rpm,source=/rpms,target=/tmp/nodejs-rpms \
       NODEJS_INSTALLROOT=/mnt/rootfs bash /opt/nodejs-rpm/install-nodejs.sh /tmp/nodejs-rpms \
       nodejs nodejs-libs npm nodejs-full-i18n openssl-fips-provider openssl-fips-provider-so \
       bash coreutils-single sed \
       tzdata ca-certificates crypto-policies wget && \
   ```

## Disabling it again

Once Red Hat ships a newer `nodejs:24`, `install-nodejs.sh` installs it and
logs `Red Hat's nodejs ... is newer than the patched ...`. If the image build
still passes `test-node-security-fixes.js`, undo steps 3 and 4 and keep the
new checks in the test.
