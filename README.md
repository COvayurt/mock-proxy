# Mock Proxy

It has been considered that you have the ready to go environment in your computer.

## How to activate it
* `npm install`
* Get in to the `mock-proxy` path from command line.
* nodejs and npm must be installed
* Run proxy server by typing `node mock-proxy.js` and enter

## How to configure mocker-proxy
* Default configuration won't do change on responses coming from integrations
* You can still monitor the requests and responses with default configurations.
* To be able to change behavior of the server you should change configurations from `app.properties`
* Configuration explanations :
    - `make.service.sleep` -> enables to delay response(ex: `true`)
    - `sleep.time.seconds` -> seconds to delay response(ex: `10`)
    - `make.service.unavailable` -> enables to manipulate content of the real response(ex: `true`)
    - `unavailable.service.path` -> it should be the path of the real integration which activates the reponse manipulator when getting to that path(ex: `/api/help/versions`)
    - `override.response.body` -> to let override the body of the response(ex : `true`)
    - `response.body` -> you can set the body through this config if `override.response.body` is true.(ex :`{"message":"that is message"}`)
    - `mock.response.status` -> you can define the response code (ex : `503`)
