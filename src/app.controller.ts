const superagent = require('superagent');
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import { ConfigService} from '@nestjs/config';
import { Controller, Get, HttpException, HttpStatus, Query, Redirect, Req, Res } from '@nestjs/common';

import { AppService } from './app.service';

@Controller()
export class AppController {
  private authorizationUrl:string;
  private tokenUrl :string;
  private callbackUrl: string;

  private clientSecret: string;

  private clientId: string;

  private authState = uuidv4();

  constructor(private readonly appService: AppService, private configService: ConfigService) {
    this.authorizationUrl =`https://login.salesforce.com/services/oauth2/authorize?client_id=${configService.get<string>('SALESFORCE_CLIENT_ID')}&redirect_uri=${configService.get<string>('SALESFORCE_CALLBACK_URL')}&response_type=code&state=${this.authState}&scope=${configService.get<string>('SALESFORCE_SCOPES')}`;
    this.clientSecret = configService.get<string>('SALESFORCE_CLIENT_SECRET');
    this.callbackUrl = configService.get<string>('SALESFORCE_CALLBACK_URL');
    this.tokenUrl = configService.get<string>('SALESFORCE_TOKEN_URL');
    this.clientId = configService.get<string>('SALESFORCE_CLIENT_ID');
  }

  @Get('/callback')
  async handleCallback(@Req() req: Request, @Res() res: Response, @Query('code') code: string, @Query('state') state: string, @Query('error') error: string) {

    if (error) {
      // Something failed, display the error in your application
      throw new HttpException(`Got an error:${error}`, HttpStatus.BAD_REQUEST);
    }

    if (!state || state !== this.authState) {
      throw new HttpException('Invalid state', HttpStatus.BAD_REQUEST);
    }

    if (!code) {
      throw new HttpException('Invalid code', HttpStatus.BAD_REQUEST);
    }

    // Exchange the code and get an access token.
    const params = {
      grant_type: 'authorization_code',
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.callbackUrl,
    };

    const response = await superagent.post(this.tokenUrl).set('Content-Type', 'application/json').type('form').send(params);

    const { access_token, refresh_token, instance_url } = response.body;
    res.cookie('refresh_token', refresh_token);
    res.cookie('instance', instance_url);
    const options = {
      instanceUrl: instance_url,
      accessToken: access_token,
    };

    const contacts = await this.appService.loadContacts(options);
    res.status(200);
    res.send(contacts);
   
  }

  @Get('/authorize')
  authorize(@Res() response) {
    response.status(301).redirect(this.authorizationUrl);
  }


  @Get('/revoke')
  async revokeAccess(@Req() request: Request) {
    const revokeUrl = `${request.cookies['instance']}/services/oauth2/revoke`;
    await superagent
    .post(revokeUrl)
    .set('Content-Type', 'application/json')
    .type('form').send({
      token: request.cookies['refresh_token']
    });

    return 'Token revoked';

  }
}
