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
        
        const latencyMs = Date.now() - started;
        const success = response.status === service.expected_status; //response.status === expected_status- Usually expect 200

        return{
            success,
            statusCode: response.status,
            latencyMs,
            errorMessage: success ? null : `Expected ${service.expected_status}, got ${response.status}`,
        };
    }
    catch(err){
        const latencyMs = Date.now() - started;
        const message = err.name === 'AbortError' ? 'Timeout' : err.message;

        return{
            success: false,
            statusCode: null,
            latencyMs,
            errorMessage: message,
        };
    }
}

async function runChecks(){
    const result = await pool.query(`SELECT id, name, url, interval_seconds, timeout_ms, expected_status, is_paused FROM services WHERE is_paused = false`); //SELECT 1 AS ok- connectivity check
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
    }
}

await runChecks();

setInterval(() => {
    runChecks().catch((err) => console.error(err));
}, 30_000);

