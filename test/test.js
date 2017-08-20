/**
 * Created by ftabaro on 26/06/17.
 */

import 'babel-polyfill';
import chai from 'chai';
import chaiHttp from 'chai-http';
import 'chai/register-expect';
import 'chai/register-should';

chai.config.includeStack = true; // turn on stack trace
chai.config.showDiff = false; // turn off reporter diff display
chai.config.truncateThreshold = 0; // disable truncating
chai.use(chaiHttp);

import Handles from '../modules/routes';
import Mobidb3WS from '../modules/server';

describe('Test Mobidb3-ws', () => {

    let server;

    beforeEach( () => {
        "use strict";
        server = new Mobidb3WS(Handles, 8088);
    });

    it('GET /', (done) => {
        chai.request(server)
            .get('/')
            .end((err, res) => {
                "use strict";
                expect(err).to.equal(null);
                expect(res).to.exist;
                return done()
            });
    });
    // it('expect', function (done) {
    //
    //     return done()
    // });
});

