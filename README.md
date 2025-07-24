# ns-fetch CLI

`ns-fetch` is a Node.js command-line tool for interacting with NetSuite's SuiteTalk REST Record API. It supports full CRUD operations, bulk imports from JSON/CSV/Excel, header and value mapping, and more.

---

## Features

* **CRUD**: Create, Read, Update, Delete records
* **Bulk Create**: from JSON file (`--bulkFile`) or `create` subcommand
* **Import**: CSV/Excel import with header and value mapping
* **Field Selection**: fetch only specific fields (`--fields`)
* **Pagination**: list records with `--limit` and `--offset`
* **OAuth 1.0a**: secure SuiteTalk authentication

---

## Installation

```bash
# clone or npm install globally
npm install -g ns-fetch
# or locally
git clone <repo>
cd ns-fetch
npm install
npm link
```

---

## Configuration

Initialize your NetSuite OAuth credentials:

```bash
ns-fetch init
```

You will be prompted to enter:

* Consumer Key
* Consumer Secret
* Token
* Token Secret
* Realm (Account ID)

These are saved in `~/.nsfetch-config.json` with restricted permissions.

---

## Usage

All commands follow the pattern:

```bash
ns-fetch [init|get|create|update|delete|import|bulk] [options]
```

### GET (Read)

Fetch a single record:

```bash
ns-fetch --type customer --id 12345
```

Fetch specific fields:

```bash
ns-fetch --type so --id 31099 --fields "memo,entity"
```

List records (paginated):

```bash
ns-fetch --type customer --limit 200 --offset 400
```

### CREATE

Create a single record with inline JSON:

```bash
ns-fetch create --type customer \
  --data '{"companyName":"Acme Corp","subsidiary":{"id":1}}'
```

Bulk create from JSON file:

```bash
ns-fetch create --type customer --bulkFile customers.json
```

### UPDATE

```bash
ns-fetch update --type so --id 31099 \
  --data '{"memo":"Updated via CLI"}'
```

### DELETE

```bash
ns-fetch delete --type vendor --id 452
```

### IMPORT (CSV / Excel)

Import CSV:

```bash
ns-fetch import --type customer \
  --csvFile customers.csv \
  --mapFile headerMap.json \
  --valueMapFile valueMap.json
```

Import Excel:

```bash
ns-fetch import --type customer \
  --excelFile customers.xlsx \
  --mapFile headerMap.json \
  --valueMapFile valueMap.json
```

* **headerMap.json** maps column headers to NetSuite field IDs
* **valueMap.json** maps raw cell values (e.g. subsidiary names) to IDs

---

## Mapping Files

### headerMap.json

```json
{
  "Name":       "companyName",
  "Email":      "email",
  "Phone":      "phone",
  "Subsidiary": "subsidiary.id"
}
```

### valueMap.json

```json
{
  "Subsidiary": {
    "Test Company": 6,
    "Globex Subsidiary": 2,
    "Initech Ltd": 3
  }
}
```

### headerMapSO.json (Sales Orders)

```json
{
  "Sales Order Number": "tranId",
  "Customer":            "entity.id",
  "Date":                "trandate",
  "Memo":                "memo",
  "Item":                "itemList.0.item.id",
  "Quantity":            "itemList.0.quantity",
  "Rate":                "itemList.0.rate"
}
```

---

## Advanced Features (Planned)

* Dry-run & validation mode
* Auto-schema discovery & CLI completion
* Delta-sync / upsert mode
* Data cleansing & fuzzy matching
* Interactive mapping UI
* Exponential back-off & retries
* Slack/email notifications on bulk jobs

---

