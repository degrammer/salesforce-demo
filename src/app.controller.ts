const superagent = require('superagent');
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Controller, Get, HttpException, HttpStatus, Query, Req, Res } from '@nestjs/common';

import { AppService } from './app.service';

@Controller()
export class AppController {
  private authorizationUrl: string;
  private tokenUrl: string;
  private callbackUrl: string;

  private clientSecret: string;

  private clientId: string;

  private authState = uuidv4();

  constructor(private readonly appService: AppService, private configService: ConfigService) {
    this.authorizationUrl = `https://login.salesforce.com/services/oauth2/authorize?client_id=${configService.get<string>(
      'SALESFORCE_CLIENT_ID'
    )}&redirect_uri=${configService.get<string>('SALESFORCE_CALLBACK_URL')}&response_type=code&state=${
      this.authState
    }&scope=${configService.get<string>('SALESFORCE_SCOPES')}`;
    this.clientSecret = configService.get<string>('SALESFORCE_CLIENT_SECRET');
    this.callbackUrl = configService.get<string>('SALESFORCE_CALLBACK_URL');
    this.tokenUrl = configService.get<string>('SALESFORCE_TOKEN_URL');
    this.clientId = configService.get<string>('SALESFORCE_CLIENT_ID');
  }

  @Get('/callback')
  async handleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string
  ) {
    const storedRefreshToken = req.cookies['refresh_token'];
    const storedAccessToken = req.cookies['access_token'];

    if (storedAccessToken && storedRefreshToken) {
      return res.status(301).redirect('/');
    }

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

    const response = await superagent
      .post(this.tokenUrl)
      .set('Content-Type', 'application/json')
      .type('form')
      .send(params);

    const { access_token, refresh_token, instance_url } = response.body;

    // We store this information here for demo purposes only, use a safe and long term storage mechanism.
    res.cookie('refresh_token', refresh_token, { httpOnly: true });
    res.cookie('instance', instance_url, { httpOnly: true });
    res.cookie('access_token', access_token, { httpOnly: true });

    res.status(301).redirect('/');
  }

  @Get('/authorize')
  authorize(@Res() response, @Req() request) {
    // Check if there is a refresh_token before redirecting the user.
    if (!request.cookies['refresh_token']) {
      response.status(301).redirect(this.authorizationUrl);
    }
    response.status(301).redirect('/');
  }

  @Get('/')
  async index(@Res() res, @Req() req) {
    const storedRefreshToken = req.cookies['refresh_token'];
    const storedAccessToken = req.cookies['access_token'];
    const storedInstance = req.cookies['instance'];

    if (!storedRefreshToken) {
      return res.status(301).redirect('/authorize');
    }

    const contacts = await this.appService.loadContacts({
      accessToken: storedAccessToken,
      refreshToken: storedRefreshToken,
      instanceUrl: storedInstance,
      oauth2: {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        redirectUri: this.callbackUrl,
      },
    }, (data) => {
      // update the access token in the storage.
      res.cookie('access_token', data.access_token, { httpOnly: true });
    });
    res.status(200);
    res.send(contacts);
  }

  @Get('/revoke')
  async revokeAccess(@Req() request: Request, @Res() res) {
    const refreshToken = request.cookies['refresh_token'];
    const instance = request.cookies['instance'];
    const revokeUrl = `${instance}/services/oauth2/revoke`;

    if (!refreshToken) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Failed to revoke access, missing refresh_token',
        },
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      await superagent.post(revokeUrl).set('Content-Type', 'application/json').type('form').send({
        token: refreshToken,
      });
    } catch (error) {
      res.status(HttpStatus.BAD_REQUEST);
      return res.send(error.message);
    }

    res.clearCookie('refresh_token');
    res.clearCookie('access_token');
    res.status(200);
    res.send('Token revoked');
  }
}
