## @

This generator creates TypeScript/JavaScript client that utilizes fetch-api.

### Building

To build and compile the typescript sources to javascript use:
```
npm install
npm run build
```

### Publishing

First build the package then run ```npm publish```

### Consuming

Navigate to the folder of your consuming project and run one of the following commands.

_published:_

```
npm install @ --save
```

_unPublished (not recommended):_

```
npm install PATH_TO_GENERATED_PACKAGE --save
```

### Usage

Below code snippet shows exemplary usage of the configuration and the API based 
on the typical `PetStore` example used for OpenAPI. 

```
import * as your_api from 'your_api_package'

// Covers all auth methods included in your OpenAPI yaml definition
const authConfig: your_api.AuthMethodsConfiguration = {
    "api_key": "YOUR_API_KEY"
}

// Implements a simple middleware to modify requests before (`pre`) they are sent
// and after (`post`) they have been received 
class Test implements your_api.Middleware {
    pre(context: your_api.RequestContext): Promise<your_api.RequestContext> {
        // Modify context here and return
        return Promise.resolve(context);
    }

    post(context: your_api.ResponseContext): Promise<your_api.ResponseContext> {
        return Promise.resolve(context);
    }

}

// Create configuration parameter object
const configurationParameters = {
    httpApi: new your_api.JQueryHttpLibrary(), // Can also be ignored - default is usually fine
    baseServer: your_api.servers[0], // First server is default
    authMethods: authConfig, // No auth is default
    promiseMiddleware: [new Test()],
}

// Convert to actual configuration
const config = your_api.createConfiguration(configurationParameters);

// Use configuration with your_api
const api = new your_api.PetApi(config);
your_api.Pet p = new your_api.Pet();
p.name = "My new pet";
p.photoUrls = [];
p.tags = [];
p.status = "available";
Promise<your_api.Pet> createdPet = api.addPet(p);

```
