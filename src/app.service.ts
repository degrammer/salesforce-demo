import {  Injectable } from '@nestjs/common';
const jsforce = require('jsforce');

@Injectable()
export class AppService {
  async loadContacts(options): Promise<string> {
    const client = new jsforce.Connection(options);
    const contacts = await client.query('SELECT count() FROM Contact');
    return `Success! Loaded ${contacts.totalSize} contacts from SFDC`;
  }
  
}
