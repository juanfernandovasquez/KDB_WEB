// Lightweight runtime validation helper using Ajv (expects Ajv available as window.Ajv)
// API: validate(schemaName, data) -> { valid: boolean, errors: any }

async function loadSchema(name) {
  const url = `./schemas/${name}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar schema ${name}`);
  return res.json();
}

const _schemaCache = new Map();
let _ajvInstance = null;

function getAjv() {
  if (!_ajvInstance) {
    if (!window.Ajv) return null;
    _ajvInstance = new window.Ajv({ allErrors: true, jsonPointers: true });
  }
  return _ajvInstance;
}

async function validate(schemaName, data) {
  try {
    if (!_schemaCache.has(schemaName)) {
      const schema = await loadSchema(schemaName);
      _schemaCache.set(schemaName, schema);
    }
    const schema = _schemaCache.get(schemaName);
    const ajv = getAjv();
    if (!ajv) return { valid: true, errors: null };
    const validateFn = ajv.compile(schema);
    const valid = validateFn(data);
    return { valid: !!valid, errors: validateFn.errors || null };
  } catch (err) {
    return { valid: false, errors: [{ message: err.message }] };
  }
}

// Expose globally for non-module consumers
window.validateSchema = (schemaName, data) => validate(schemaName, data);
