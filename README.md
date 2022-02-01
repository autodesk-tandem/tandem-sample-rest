# Tandem REST Sample

## Overview

Example of query and update of model asset data. The output just goes to the Terminal window but similar code can be used to support something like Import/Export to another application such as Excel or Google Sheets.

*NOTE: The REST API that supports this sample is not yet official.  This app is not a complete description of the API and is evolving over time as the API evolves.  Any use of this API should be for prototype purposes only.*

![Tandem TestBed App 001](./docs/Readme_img_001.png)


## Pre-requisites

1. Install npm: https://www.npmjs.com
2. Make sure you have an account and access to at least one facility at https://tandem.autodesk.com (PRODUCTION) or https://tandem-stg.autodesk.com (STAGING).
3. Create a new Application on the Forge Developer Portal to get your Client_ID: https://forge.autodesk.com

![Tandem TestBed App 010](./docs/Readme_img_010.png)
![Tandem TestBed App 011](./docs/Readme_img_011.png)
![Tandem TestBed App 012](./docs/Readme_img_012.png)


## Setup and Configuration

1. After cloning this repo, run `npm install`.
2. Add your application Client_ID to the "User/Service" panel in Tandem. This authorizes our app to get read/write access to the specific Facility.

![Tandem TestBed App 020](./docs/Readme_img_020.png)

3. Make a new config file by filling in the values in `config/default.json` and saving to `config/local.json`

![Tandem TestBed App 021](./docs/Readme_img_021.png)


## Start App

To start the development server, run `node index.js` from the Terminal command line. This will run the application in the node.js environment and return output to the Terminal window.

At this point, you should get something like the following image.

![Tandem TestBed App 030](./docs/Readme_img_030.png)

By default, the application is looking for a property named "Serial Number", which your Facility may not have set up.

## Modifying the App to look for specific property names

![Tandem TestBed App 040](./docs/Readme_img_040.png)
