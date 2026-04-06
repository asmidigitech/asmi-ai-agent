const xmlrpc = require("xmlrpc");
const fs = require("fs");

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;

function getCommonClient() {
  return xmlrpc.createClient({
    url: `${ODOO_URL}/xmlrpc/2/common`,
  });
}

function getObjectClient() {
  return xmlrpc.createClient({
    url: `${ODOO_URL}/xmlrpc/2/object`,
  });
}

async function authenticate() {
  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
    throw new Error("Missing Odoo environment variables");
  }

  const common = getCommonClient();

  return new Promise((resolve, reject) => {
    common.methodCall(
      "authenticate",
      [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}],
      (err, uid) => {
        if (err) return reject(err);
        if (!uid) return reject(new Error("Odoo authentication failed"));
        resolve(uid);
      }
    );
  });
}

async function executeKw(model, method, args = [], kwargs = {}) {
  const uid = await authenticate();
  const objectClient = getObjectClient();

  return new Promise((resolve, reject) => {
    objectClient.methodCall(
      "execute_kw",
      [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, kwargs],
      (err, value) => {
        if (err) return reject(err);
        resolve(value);
      }
    );
  });
}

async function updateLead(leadId, values) {
  if (!leadId) throw new Error("leadId is required");

  return executeKw("crm.lead", "write", [[leadId], values]);
}

async function readLead(leadId, fields = []) {
  if (!leadId) throw new Error("leadId is required");

  return executeKw("crm.lead", "read", [[leadId]], {
    fields,
  });
}

async function createAttachment({
  leadId,
  name,
  filePath,
  mimetype = "application/octet-stream",
}) {
  if (!leadId) throw new Error("leadId is required");
  if (!name) throw new Error("attachment name is required");
  if (!filePath) throw new Error("filePath is required");

  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString("base64");

  return executeKw("ir.attachment", "create", [
    {
      name,
      type: "binary",
      datas: base64Data,
      res_model: "crm.lead",
      res_id: leadId,
      mimetype,
    },
  ]);
}

async function createAttachmentFromBuffer({
  leadId,
  name,
  buffer,
  mimetype = "application/octet-stream",
}) {
  if (!leadId) throw new Error("leadId is required");
  if (!name) throw new Error("attachment name is required");
  if (!buffer) throw new Error("buffer is required");

  const base64Data = Buffer.from(buffer).toString("base64");

  return executeKw("ir.attachment", "create", [
    {
      name,
      type: "binary",
      datas: base64Data,
      res_model: "crm.lead",
      res_id: leadId,
      mimetype,
    },
  ]);
}

module.exports = {
  authenticate,
  executeKw,
  updateLead,
  readLead,
  createAttachment,
  createAttachmentFromBuffer,
};