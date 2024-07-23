const url = require('url');
const http = require('http');
const https = require('https');
const uuidv4 = require('uuid/v4');
const PropertiesReader = require('properties-reader');
const cluster = require('cluster');

const PORT = process.argv[2] || 3030;
const CONCURRENCY = process.argv[3] || 1;

if (cluster.isMaster) {
    for (var i = 0; i < CONCURRENCY; i++) {
        cluster.fork();
    }
    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
    });
} else {

    const properties = function () {
        return PropertiesReader('./app.properties');
    };

    const fixURLIfCorrupted = function (reqUrl) {
        if (reqUrl.indexOf("https://") === -1 && reqUrl.indexOf("https") > -1) {
            reqUrl = reqUrl.replace("https:/", "https://");
        } else if (reqUrl.indexOf("http://") === -1 && reqUrl.indexOf("http") > -1) {
            reqUrl = reqUrl.replace("http:/", "http://");
        }
        return reqUrl;
    };

    const sleep = function (ms) {
        var waitTill = new Date(new Date().getTime() + ms * 1000);
        while (waitTill > new Date()) {
        }
    };

    const server = http.createServer(function (req, res) {
        let prop = properties();
        let filterResponse = prop.get('filter.response');
        let filterResponsePath = prop.get('filter.response.path');
        let filterResponseExclusionList = prop.get('filter.response.body.exclude');
        let makeServiceSleep = prop.get('make.service.sleep');
        let sleepTimeSeconds = prop.get('sleep.time.seconds');
        let makeServiceUnavailable = prop.get('make.service.unavailable');
        let unavailableServicePath = prop.get('unavailable.service.path');
        let unavailableServiceMethod = prop.get('unavailable.service.method');
        let overrideResponseBody = prop.get('override.response.body');
        let responseBody = prop.get('response.body') + "";
        let mockResponseStatus = prop.get('mock.response.status');
        if (!mockResponseStatus) {
            mockResponseStatus = "503";
        }

        let reqUrl = req.url.substr(1);
        const reqMethod = req.method;
        const processUUID = "PID_" + cluster.worker.process.pid + "_UUID" + uuidv4();
        console.log('\n\n' + processUUID + ' ==> Making req for ' + reqUrl);


        req.pause();

        reqUrl = fixURLIfCorrupted(reqUrl);

        let options = url.parse(reqUrl);
        options.headers = req.headers;
        options.method = req.method;
        options.slashes = true;
        options.port = 443;
        options.insecure = true;

        options.headers['host'] = options.host + ':443';

        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

        let connector = (options.protocol === 'https:' ? https : http).request(options, async function (serverResponse) {

            console.log(processUUID + ' <== Received res for', serverResponse.statusCode, reqUrl);
            console.log(processUUID + '\t-> Request details: ', JSON.stringify(options));
            console.log(processUUID + '\t-> Real response status: ', JSON.stringify(serverResponse.statusCode));
            console.log(processUUID + '\t-> Real response headers: ', JSON.stringify(serverResponse.headers));

            let body = "";
            serverResponse.on('data', chunk => body += chunk);
            serverResponse.on('end', () => console.log(processUUID + '\t-> Real response body: ' + body));

            serverResponse.pause();
            serverResponse.headers['access-control-allow-origin'] = '*';

            switch (serverResponse.statusCode) {
                case 200:
                case 201:
                case 202:
                    if (reqUrl.indexOf(unavailableServicePath) !== -1 && (unavailableServiceMethod == null || reqMethod === unavailableServiceMethod)) {
                        if (makeServiceSleep) {

                            let start = new Date().getTime();
                            console.log(processUUID + ' ' + sleepTimeSeconds + ' seconds delay started at ' + start);
                            sleep(sleepTimeSeconds);
                            let end = new Date().getTime();
                            let elapsed = end - start;
                            console.log(processUUID + ' ' + end + ' delay ended elapsed ' + elapsed + " ms");
                        }
                        if (makeServiceUnavailable) {
                            serverResponse.headers['content-type'] = 'text/plain';
                            res.writeHeader(mockResponseStatus, serverResponse.headers);
                            console.log("\t-> Mock status: " + mockResponseStatus);

                            if (overrideResponseBody) {
                                let response = responseBody;
                                if (!response) {
                                    response = "tasty";
                                }

                                res.end(response);
                                console.log("\t-> Mock response body : " + response);
                            }
                            serverResponse.pipe(res, {end: true});
                            serverResponse.resume();
                            break;
                        }
                    }
                    if (filterResponse && reqUrl.indexOf(filterResponsePath) !== -1 && filterResponseExclusionList) {
                        serverResponse.headers['content-type'] = 'application/json';
                        res.writeHeader("200", serverResponse.headers);
                        serverResponse.resume();
                        const body = await new Promise(resolve => {
                            let body = '';
                            serverResponse.on('data', chunk => body += chunk);
                            serverResponse.on('end', () => resolve(body));
                        }).catch(f => console.log(f));
                        let filteredJson = JSON.parse(body);
                        let idArray = JSON.parse(filterResponseExclusionList);
                        filteredJson = filteredJson.filter(f => idArray.find(id => id === f.id) === undefined);
                        res.end(JSON.stringify(filteredJson));
                        serverResponse.pipe(res, {end: true});
                        break;
                    }
                case 203:
                case 204:
                case 205:
                case 206:
                case 304:
                case 400:
                case 401:
                case 402:
                case 403:
                case 404:
                case 405:
                case 406:
                case 407:
                case 408:
                case 409:
                case 410:
                case 411:
                case 412:
                case 413:
                case 414:
                case 415:
                case 416:
                case 417:
                case 418:
                    res.writeHeader(serverResponse.statusCode, serverResponse.headers);
                    serverResponse.pipe(res, {end: true});
                    serverResponse.resume();
                    break;

                // fix host and pass through.
                case 301:
                case 302:
                case 303:
                    serverResponse.statusCode = 303;
                    serverResponse.headers['location'] = 'http://localhost:' + PORT + '/' + serverResponse.headers['location'];
                    console.log('\t-> Redirecting to ', serverResponse.headers['location']);
                    res.writeHeader(serverResponse.statusCode, serverResponse.headers);
                    serverResponse.pipe(res, {end: true});
                    serverResponse.resume();
                    break;

                // error everything else
                default:
                    let stringifiedHeaders = JSON.stringify(serverResponse.headers, null, 4);
                    serverResponse.resume();
                    serverResponse.headers['content-type'] = 'text/plain';
                    res.writeHeader(500, serverResponse.headers);
                    res.end(process.argv.join(' ') + ':\n\nError ' + serverResponse.statusCode + '\n' + stringifiedHeaders);
                    break;
            }

        });
        req.pipe(connector, {end: true});
        req.resume();
    });

    console.log('%s Listening on http://localhost:%s...', cluster.worker.process.pid, PORT);
    server.listen(PORT);
}
