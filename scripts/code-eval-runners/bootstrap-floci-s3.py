#!/usr/bin/env python3
import os
import time

import boto3
from botocore.exceptions import ClientError

ENDPOINT = os.environ.get("FLOCI_ENDPOINT", "http://localhost:4566").rstrip("/")
BUCKET = os.environ.get("FLOCI_S3_BUCKET", "langfuse")
REGION = os.environ.get("AWS_REGION", "us-east-1")
ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "test")
SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "test")


def main() -> None:
    client = boto3.client(
        "s3",
        endpoint_url=ENDPOINT,
        region_name=REGION,
        aws_access_key_id=ACCESS_KEY_ID,
        aws_secret_access_key=SECRET_ACCESS_KEY,
    )

    create_bucket(client)
    client.put_bucket_cors(
        Bucket=BUCKET,
        CORSConfiguration={
            "CORSRules": [
                {
                    "AllowedHeaders": ["*"],
                    "AllowedMethods": ["GET", "HEAD", "PUT"],
                    "AllowedOrigins": ["*"],
                    "ExposeHeaders": ["ETag", "x-amz-checksum-sha256"],
                    "MaxAgeSeconds": 3600,
                }
            ]
        },
    )

    print(f"Floci S3 bucket {BUCKET!r} is ready.", flush=True)


def create_bucket(client) -> None:
    for attempt in range(60):
        try:
            client.create_bucket(Bucket=BUCKET)
            return
        except ClientError as error:
            code = error.response.get("Error", {}).get("Code")
            if code in {"BucketAlreadyExists", "BucketAlreadyOwnedByYou"}:
                return
            if attempt == 59:
                raise
            time.sleep(1)


if __name__ == "__main__":
    main()
