# Although the canonical way to get the package version is using pkg_resources
# as below, this turns out to be very slow on systems with lots of packages.
# So, until that is remedied, we'll import the version from a local file
# created by setuptools_scm.

# from pkg_resources import get_distribution, DistributionNotFound
# try:
#     __version__ = get_distribution(__name__).version
# except DistributionNotFound:
#     # package is not installed
#     pass

from .version import version as __version__
from ._version import (  # noqa: F401
    library_version_number,
    library_version_string,
)

VERSION = __version__
