#!/usr/bin/env node

const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const axios    = require('axios');
const OAuth    = require('oauth-1.0a');
const crypto   = require('crypto');
const minimist = require('minimist');
const readline = require('readline');
const { URL }  = require('url');

let parseCsv;
let xlsx;
try {
  const csvSync = require('csv-parse/sync');
  parseCsv = csvSync.parse ? csvSync.parse : csvSync;
} catch {}
try { xlsx = require('xlsx'); } catch {};


const CONFIG_PATH = path.join(os.homedir(), '.nsfetch-config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function saveConfig(conf) {
  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify(conf, null, 2),
    { mode: 0o600 }
  );
  console.log(`Credentials saved to ${CONFIG_PATH}`);
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => {
    rl.close(); resolve(answer.trim());
  }));
}

function headerToFieldId(header) {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+([a-z0-9])/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9_]/g, '');
}

const args = minimist(process.argv.slice(2), {
  string: ['url','method','data','type','id','fields','bulkFile','csvFile','excelFile','mapFile'],
  default: { method: 'GET', limit: '1000', offset: '0' }
});

(async () => {
  if (args._[0] === 'init') {
    const consumerKey    = await prompt('Consumer Key: ');
    const consumerSecret = await prompt('Consumer Secret: ');
    const token          = await prompt('Token: ');
    const tokenSecret    = await prompt('Token Secret: ');
    const realm          = await prompt('Realm (Account ID): ');
    saveConfig({ consumerKey, consumerSecret, token, tokenSecret, realm });
    process.exit(0);
  }

  const config = loadConfig();
  if (!config) {
    console.error('No credentials found. Run `ns-fetch init` first.');
    process.exit(1);
  }

  const action = ['create','update','delete','bulk','import'].includes(args._[0])
    ? args._[0]
    : 'get';

  const typeMap = { so:'salesOrder', po:'purchaseOrder', inv:'invoice', customer:'customer', vendor:'vendor' };
  const recordType = typeMap[args.type] || args.type;
  if (!recordType && action !== 'get') {
    console.error('Error: Missing or invalid --type');
    process.exit(1);
  }

  const domain = config.realm.toLowerCase().replace('_','-');
  const base   = `https://${domain}.suitetalk.api.netsuite.com/services/rest/record/v1/${recordType}`;

  const oauth = OAuth({
    consumer: { key: config.consumerKey, secret: config.consumerSecret },
    signature_method: 'HMAC-SHA256',
    hash_function(baseString, key) {
      return crypto.createHmac('sha256', key).update(baseString).digest('base64');
    }
  });

  async function sendRequest(method, url, data) {
    const reqData   = { url, method };
    const tokData   = { key: config.token, secret: config.tokenSecret };
    const oauthHdrs = oauth.toHeader(oauth.authorize(reqData, tokData));
    const headers   = {
      ...oauthHdrs,
      'Content-Type': 'application/json',
      Authorization:  `${oauthHdrs.Authorization}, realm="${config.realm}"`
    };
    const resp = await axios({ url, method, headers, data });
    return resp.data;
  }

  try {
    let records = [];

    if (args.csvFile || args.excelFile) {
      if (args.csvFile && !parseCsv) {
        console.error('Install csv-parse (`npm install csv-parse`) to import CSV');
        process.exit(1);
      }
      if (args.excelFile && !xlsx) {
        console.error('Install xlsx (`npm install xlsx`) to import Excel');
        process.exit(1);
      }
      let rows;
      if (args.csvFile) {
        const text = fs.readFileSync(args.csvFile, 'utf8');
        rows = parseCsv(text, { columns: true, skip_empty_lines: true });
      } else {
        const wb = xlsx.readFile(args.excelFile);
        rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      }

      let headerMap = null;
      if (args.mapFile) {
        headerMap = JSON.parse(fs.readFileSync(args.mapFile, 'utf8'));
      }

      let valueMap = null;
      if (args.valueMapFile) {
        valueMap = JSON.parse(fs.readFileSync(args.valueMapFile, 'utf8'));
      }

      records = rows.map(row => {
        const payload = {};
        for (const h of Object.keys(row)) {
          let rawVal = row[h];
          if (valueMap && valueMap[h] && valueMap[h][rawVal] !== undefined) {
            rawVal = valueMap[h][rawVal];
          }
          const fieldId = headerMap && headerMap[h] ? headerMap[h] : headerToFieldId(h);
          if (fieldId.includes('.')) {
            const parts = fieldId.split('.');
            let obj = payload;
            for (let i = 0; i < parts.length - 1; i++) {
              if (!obj[parts[i]]) obj[parts[i]] = {};
              obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = rawVal;
          } else {
            payload[fieldId] = rawVal;
          }
        }
        return payload;
      });
      const results = [];
      for (const rec of records) {
        results.push(await sendRequest('POST', base, rec));
      }
      console.log(JSON.stringify(results, null, 2));
      process.exit(0);
    }
    if (action === 'bulk' || (action === 'create' && args.bulkFile)) {
      if (!args.bulkFile) {
        console.error('Error: --bulkFile <path> is required for bulk');
        process.exit(1);
      }
      let arr = JSON.parse(fs.readFileSync(args.bulkFile, 'utf8'));
      if (!Array.isArray(arr)) arr = [arr];
      const results = [];
      for (const rec of arr) {
        results.push(await sendRequest('POST', base, rec));
      }
      console.log(JSON.stringify(results, null, 2));
      process.exit(0);
    }

    if (action === 'create') {
      if (!args.data) {
        console.error('Error: --data JSON payload required for create');
        process.exit(1);
      }
      const payload = JSON.parse(args.data);
      const out     = await sendRequest('POST', base, payload);
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }

    let recordId = args.id || args._.find(x => /^\d+$/.test(x));
    if (!recordId && action !== 'get') {
      console.error('Error: --id or numeric positional required');
      process.exit(1);
    }
    let url = recordId ? `${base}/${recordId}` : base;

    if (action === 'update') {
      if (!args.data) {
        console.error('Error: --data JSON payload required for update');
        process.exit(1);
      }
      const payload = JSON.parse(args.data);
      const out     = await sendRequest('PATCH', url, payload);
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }

    if (action === 'delete') {
      await sendRequest('DELETE', url);
      console.log(JSON.stringify({ deleted: recordId }, null, 2));
      process.exit(0);
    }

    const u = new URL(url);
    if (recordId && args.fields) {
      const fl = Array.isArray(args.fields)
        ? args.fields
        : args.fields.split(',').map(f => f.trim());
      u.searchParams.set('fields', fl.join(','));
    }
    if (!recordId) {
      u.searchParams.set('limit', args.limit);
      u.searchParams.set('offset', args.offset);
    }
    const out = await sendRequest('GET', u.toString());
    console.log(JSON.stringify(out, null, 2));

  } catch (err) {
    if (err.response) console.error('HTTP', err.response.status, err.response.data);
    else console.error('Error:', err.message);
    process.exit(1);
  }
})();