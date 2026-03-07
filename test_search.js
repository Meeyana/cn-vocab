import { handler } from './netlify/functions/search.js';

handler({
    httpMethod: 'GET',
    queryStringParameters: {
        word: 'hello'
    }
}).then(res => {
    console.log(JSON.stringify(res, null, 2));
}).catch(err => {
    console.error(err);
});
