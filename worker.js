import 'dotenv/config';
import { pool } from './db.js'; //Same Postgres pool helper

console.log('PulseBoard worker starting...');

async function checkService(service){
    const started = Date.now();

    try{
        const controller = new AbortController();  //AbortController + setTimeout- cancel req after timeout_ms
        const timer = setTimeout(() => controller.abort(), service.timeout_ms);

        const response = await fetch(service.url, {
            method: 'GET',
            signal: controller.signal,
        }); //fetch(service.url)- Real HTTP GET

        clearTimeout(timer);
        
        const latencyMs = Date.now() - started; ////how long the check took(in ms)
        const success = response.status === service.expected_status; //response.status === expected_status- Usually expect 200

        //status 200,expected 200-success=true
        //status 500,expected 200-success=false

        return{
            success, //did it match expected status?
            statusCode: response.status, //HTTP code (200, 404)
            latencyMs, //duration
            errorMessage: success ? null : `Expected ${service.expected_status}, got ${response.status}`, //null if OK;short reason if not
        };
    }
    catch(err){ //fetch threw: timeout abort, DNS fail, connection reset, etc
        const latencyMs = Date.now() - started; //still measuring how long until failure
        const message = err.name === 'AbortError' ? 'Timeout' : err.message; //If condition is (Abort from our timer)-message='Timeout'), if anything else,Message=err.message(e.g 'fetch failed)
        return{
            success: false,
            statusCode: null, //since never got an HTTP response
            latencyMs,
            errorMessage: message,
        };
    }
}

async function runChecks(){
    const result = await pool.query(`SELECT id, name, url, interval_seconds, timeout_ms, expected_status, is_paused, workspace_id FROM services WHERE is_paused = false`); //SELECT 1 AS ok- connectivity check
    // console.log('WORKER DB ok:', result.rows[0]);

    // await pool.end(); //Close connections so Node can exit cleanly

    console.log(`Found ${result.rows.length} service(s) to check:`);

    for(const service of result.rows){
        // 
        
        const check = await checkService(service);
        console.log(
            `- ${service.name}: success=${check.success} status=${check.statusCode} latency=${check.latencyMs}ms error=${check.errorMessage}`
        );

        await pool.query(
            `INSERT INTO health_checks(service_id, success, status_code, latency_ms, error_message) VALUES ($1, $2, $3, $4, $5)`, [service.id, check.success, check.statusCode, check.latencyMs, check.errorMessage,]
        );

        const newStatus = check.success ? 'operational' : 'down';
        await pool.query(`UPDATE services SET current_status = $1 WHERE id = $2`,
            [newStatus, service.id]);

        // Day 7: one open incident per continuous outage (create / skip / resolve)
        await syncIncident(service, check.success);

        try {
    await fetch('http://localhost:3000/internal/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: service.workspace_id  }),
    });
} catch (err) {
    console.error('notify failed:', err.message);
}
    }
}

async function syncIncident(service, checkSucceeded) {
    const open = await pool.query(
        `SELECT id FROM incidents
         WHERE service_id = $1 AND resolved_at IS NULL
         LIMIT 1`,
        [service.id]
    );

    const hasOpenIncident = open.rows.length > 0;

    if (!checkSucceeded) {
        if (!hasOpenIncident) {
            await pool.query(
                `INSERT INTO incidents (service_id, severity, status, summary)
                 VALUES ($1, 'critical', 'open', $2)`,
                [service.id, `${service.name} is unavailable`]
            );
            console.log(`  → incident OPENED for ${service.name}`);
        }
        return;
    }

    if (hasOpenIncident) {
        await pool.query(
            `UPDATE incidents
             SET resolved_at = now(), status = 'resolved'
             WHERE service_id = $1 AND resolved_at IS NULL`,
            [service.id]
        );
        console.log(`  → incident RESOLVED for ${service.name}`);
    }
}

await runChecks();

setInterval(() => {
    runChecks().catch((err) => console.error(err));
}, 30_000);

