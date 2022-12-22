import {  HttpException, HttpStatus, Injectable } from '@nestjs/common';
const jsforce = require('jsforce');

@Injectable()
export class AppService {
  async loadContacts(options, onRefresh): Promise<string> {
  try {
    const connection = new jsforce.Connection(options);
    connection.on('refresh', function(accessToken, data){
      onRefresh(data);
    });
    const contacts = await connection.query('SELECT count() FROM Contact');
    return `Success! Loaded ${contacts.totalSize} contacts from SFDC`;
  } catch (error) {
    throw new HttpException({
      status: HttpStatus.BAD_REQUEST,
      error: `Failed to load contacts from Salesforce, reason: ${error.message}`,
    }, HttpStatus.FORBIDDEN, {
      cause: error
    });
  }
  }
  
}
