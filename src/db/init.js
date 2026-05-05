// Crea las tablas a partir de schema.sql
const fs = require('fs');
const path = require('path');
const db = require('./database');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

console.log('OK - Schema creado/verificado en la base de datos.');
