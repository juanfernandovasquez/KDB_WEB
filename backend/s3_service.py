import mimetypes
import os
import re
import uuid
from urllib.parse import quote

import boto3
from botocore.exceptions import BotoCoreError, ClientError


def _get_bucket_config():
    bucket = (os.environ.get("S3_BUCKET") or "").strip()
    region = (os.environ.get("S3_REGION") or "").strip()
    prefix = (os.environ.get("S3_PREFIX") or "").lstrip("/")
    public_base = (os.environ.get("S3_PUBLIC_BASE_URL") or "").rstrip("/")
    if not bucket:
        raise ValueError("S3_BUCKET no esta configurado")
    if prefix and not prefix.endswith("/"):
        prefix = f"{prefix}/"
    return bucket, region, prefix, public_base


def _build_public_url(bucket, region, key, public_base):
    if public_base:
        return f"{public_base}/{quote(key)}"
    # Default to virtual-hosted-style URLs.
    if region:
        return f"https://{bucket}.s3.{region}.amazonaws.com/{quote(key)}"
    return f"https://{bucket}.s3.amazonaws.com/{quote(key)}"


def _sanitize_filename(filename):
    base = os.path.basename(filename or "").strip()
    if not base:
        return f"upload-{uuid.uuid4().hex}"
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", base).strip("-")
    return safe or f"upload-{uuid.uuid4().hex}"


def _assert_key_in_prefix(key, prefix):
    if prefix and not key.startswith(prefix):
        raise ValueError("Key fuera del prefijo permitido")


def _sanitize_folder_name(name):
    base = os.path.basename(name or "").strip()
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", base).strip("-")
    return safe or f"folder-{uuid.uuid4().hex}"


def create_presigned_post(filename, content_type=None, max_bytes=None, prefix_override=None):
    bucket, region, prefix, public_base = _get_bucket_config()
    if prefix_override is not None:
        prefix = prefix_override.lstrip("/")
        if prefix and not prefix.endswith("/"):
            prefix = f"{prefix}/"
    max_bytes = max_bytes or int(os.environ.get("S3_UPLOAD_MAX_BYTES", "10485760"))
    expires = int(os.environ.get("S3_UPLOAD_EXPIRES", "3600"))
    safe_name = _sanitize_filename(filename)
    key = f"{prefix}{uuid.uuid4().hex}_{safe_name}" if prefix else f"{uuid.uuid4().hex}_{safe_name}"
    if not content_type:
        content_type = mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
    fields = {"Content-Type": content_type}
    conditions = [{"Content-Type": content_type}, ["content-length-range", 1, max_bytes]]
    client = boto3.client("s3", region_name=region or None)
    try:
        post = client.generate_presigned_post(
            Bucket=bucket,
            Key=key,
            Fields=fields,
            Conditions=conditions,
            ExpiresIn=expires,
        )
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError("No se pudo generar URL de subida") from exc
    return {
        "post": post,
        "key": key,
        "url": _build_public_url(bucket, region, key, public_base),
        "content_type": content_type,
        "max_bytes": max_bytes,
        "expires_in": expires,
    }


def delete_media_object(key, prefix_override=None):
    bucket, region, prefix, _ = _get_bucket_config()
    if prefix_override is not None:
        prefix = prefix_override.lstrip("/")
        if prefix and not prefix.endswith("/"):
            prefix = f"{prefix}/"
    key = (key or "").strip()
    if not key:
        raise ValueError("key es obligatorio")
    _assert_key_in_prefix(key, prefix)
    client = boto3.client("s3", region_name=region or None)
    try:
        client.delete_object(Bucket=bucket, Key=key)
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError("No se pudo eliminar la imagen") from exc
    return True


def rename_media_object(key, new_name, prefix_override=None):
    bucket, region, prefix, public_base = _get_bucket_config()
    if prefix_override is not None:
        prefix = prefix_override.lstrip("/")
        if prefix and not prefix.endswith("/"):
            prefix = f"{prefix}/"
    key = (key or "").strip()
    new_name = (new_name or "").strip()
    if not key:
        raise ValueError("key es obligatorio")
    if not new_name:
        raise ValueError("new_name es obligatorio")
    _assert_key_in_prefix(key, prefix)
    dir_part = ""
    if "/" in key:
        dir_part = key.rsplit("/", 1)[0] + "/"
    safe_name = _sanitize_filename(new_name)
    if "." not in safe_name:
        ext = os.path.splitext(os.path.basename(key))[1]
        if ext:
            safe_name = f"{safe_name}{ext}"
    new_key = f"{dir_part}{safe_name}"
    _assert_key_in_prefix(new_key, prefix)
    if new_key == key:
        raise ValueError("El nombre es igual al actual")
    client = boto3.client("s3", region_name=region or None)
    try:
        client.head_object(Bucket=bucket, Key=new_key)
        raise ValueError("Ya existe una imagen con ese nombre")
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code not in ("404", "NoSuchKey", "NotFound"):
            raise RuntimeError("No se pudo validar el nuevo nombre") from exc
    try:
        client.copy_object(Bucket=bucket, CopySource={"Bucket": bucket, "Key": key}, Key=new_key)
        client.delete_object(Bucket=bucket, Key=key)
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError("No se pudo renombrar la imagen") from exc
    return new_key, _build_public_url(bucket, region, new_key, public_base)


def create_media_folder(folder_name, prefix_override=None):
    bucket, region, prefix, _ = _get_bucket_config()
    if prefix_override is not None:
        prefix = prefix_override.lstrip("/")
        if prefix and not prefix.endswith("/"):
            prefix = f"{prefix}/"
    folder_name = (folder_name or "").strip()
    if not folder_name:
        raise ValueError("folder_name es obligatorio")
    safe_name = _sanitize_folder_name(folder_name)
    key = f"{prefix}{safe_name}/" if prefix else f"{safe_name}/"
    client = boto3.client("s3", region_name=region or None)
    try:
        client.head_object(Bucket=bucket, Key=key)
        raise ValueError("La carpeta ya existe")
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code not in ("404", "NoSuchKey", "NotFound"):
            raise RuntimeError("No se pudo validar la carpeta") from exc
    try:
        client.put_object(Bucket=bucket, Key=key)
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError("No se pudo crear la carpeta") from exc
    return key


def list_media_objects(limit=200, prefix_override=None, continuation=None):
    bucket, region, prefix, public_base = _get_bucket_config()
    if prefix_override is not None:
        prefix = prefix_override.lstrip("/")
        if prefix and not prefix.endswith("/"):
            prefix = f"{prefix}/"
    client = boto3.client("s3", region_name=region or None)
    params = {"Bucket": bucket, "MaxKeys": limit}
    if prefix:
        params["Prefix"] = prefix
    if continuation:
        params["ContinuationToken"] = continuation
    try:
        resp = client.list_objects_v2(**params)
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError("No se pudo listar el bucket S3") from exc
    items = []
    for obj in resp.get("Contents", []) or []:
        key = obj.get("Key") or ""
        if not key or key.endswith("/"):
            continue
        items.append(
            {
                "key": key,
                "url": _build_public_url(bucket, region, key, public_base),
                "size": obj.get("Size") or 0,
                "last_modified": obj.get("LastModified").isoformat() if obj.get("LastModified") else "",
            }
        )
    next_token = resp.get("NextContinuationToken") if resp.get("IsTruncated") else None
    return items, next_token, prefix
