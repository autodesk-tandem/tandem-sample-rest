
//Copyright 2022 Autodesk, Inc.
//All rights reserved.
//
//This computer source code and related instructions and comments are the
//unpublished confidential and proprietary information of Autodesk, Inc.
//and are protected under Federal copyright and state trade secret law.
//They may not be disclosed to, copied or used by any third party without
//the prior written consent of Autodesk, Inc.
//

const https = require('https');
const events = require('events');
const config = require('config');

const AuthEvent = {
	TOKEN_REFRESH: "tokenRefresh",
	TOKEN_ERROR: "tokenError"
};

const SCOPE_ALL = "viewables:read data:read data:write data:create bucket:create bucket:read bucket:update";


class AdskAuth extends events.EventEmitter {
	
	
	constructor(options) {

		super();

		options = options || {};

		this.endpoint = options.endpoint || config.get("ADSK_API_HOST");
		this.key = options.key || config.get("FORGE_KEY");
		this.secret = options.secret || config.get("FORGE_SECRET");
		this.currentToken = null;
		this.currentTokenScope = null;
		this.timeoutId = undefined;
	}

	getTokenString() {
		return this.currentToken.access_token;
	}

	refreshToken(callback, scope) {

		scope = scope || SCOPE_ALL;

		//If we are called explicitly, cancel any pending
		//self-refresh.
		if (this.timeoutId)
			clearTimeout(this.timeoutId);

		let dataString = "client_id=" + this.key 
			+ "&client_secret=" + this.secret 
			+ "&grant_type=client_credentials" 
			+ "&scope=" + scope;

		let headers = {
			"Content-Type": "application/x-www-form-urlencoded"
		};

		let options = {
			host: this.endpoint,
			port: 443,
			path: "/authentication/v1/authenticate",
			method: "POST",
			headers: headers,
		};

		let req = https.request(options, (res) => {
			res.setEncoding("utf8");
			let responseString = "";

			res.on("data", data => {
				responseString += data;
			});

			res.on("end", () => {

				if (res.statusCode == 200) {

					let token = JSON.parse(responseString);

					this.currentToken = token;
					this.currentTokenScope = scope;

					//console.log("Got a token: " + token.access_token);

					token.expires_at = Date.now() + token.expires_in * 1000;

					//Schedule a token refresh a few seconds before
					//the current token expires.
					var timeout = (token.expires_in - 5) * 1000;
					if (timeout > 0)
						this.timeoutId = setTimeout(() => this.refreshToken(callback, scope)
							, timeout);

					if (callback) callback(null, token);

					this.emit(AuthEvent.TOKEN_REFRESH, token);

				} else {

					console.log("Token fetch failed.");

					if (callback)callback(res.status, null);

					this.emit(AuthEvent.TOKEN_ERROR, res.statusCode);

					//If token get fails, try again in a few seconds.
					//TODO: Make the timing variable
					this.timeoutId = setTimeout( () => {
						this.refreshToken(callback, scope);
					}, 5000);

				}
			});
		});

		req.write(dataString);
		req.end();
	}

	//Promisified version of refreshToken
	async getToken(scope, timeNeeded) {

		scope = scope || SCOPE_ALL;
		timeNeeded = timeNeeded || 5000;

		if (this.currentToken && this.currentTokenScope === scope) {

			let timeLeft = this.currentToken.expires_at - Date.now();

			if (timeLeft > timeNeeded)
				return Promise.resolve(this.currentToken);
		}

		return new Promise( (resolve, reject) => {
			this.refreshToken( (error, token) => {
				if (error)
					return reject(error);
				else
					return resolve(token);
			}, scope);
		});
	}
}


exports.AdskAuth = AdskAuth;