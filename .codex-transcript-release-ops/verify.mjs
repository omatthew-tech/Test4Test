import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { buildTranscriptReport, transcriptCoverage } from '../src/lib/transcriptReport.ts';
const project = 'lteimepkxuiupbcsbcpz', url = `https://${project}.supabase.co`;
const keys = JSON.parse(execFileSync('C:/Users/matth/scoop/shims/supabase.exe', ['projects','api-keys','--project-ref',project,'--output','json'], {encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const key = keys.find(k=>k.name==='anon').api_key;
const options = {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin = createClient(url,keys.find(k=>k.name==='service_role').api_key,options);
const client = createClient(url,key,options);
const link = await admin.auth.admin.generateLink({type:'magiclink',email:'test@test4test.io'});
assert.equal(link.error,null);
const verified = await client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'email'});
assert.equal(verified.error,null);
assert.equal(verified.data.user.id,'70ad8c94-5591-4e71-8f42-83ea1e046105');
async function call(name,body,auth=true,extra={}) {
 return fetch(`${url}/functions/v1/${name}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${verified.data.session.access_token}`} :{}),...extra},body:JSON.stringify(body)});
}
try {
 const response=await call('get-transcript-report',{appId:'54822399-fe7a-46e0-87c3-e798b50788d6'});
 if(!response.ok) throw Error(`Report status ${response.status}: ${JSON.stringify(await response.json())}`);
 const report=await response.json();
 assert.equal(report.recordings.length,2); assert.equal(report.nextCursor,null);
 assert.deepEqual(transcriptCoverage(report.recordings),{total:2,ready:2,failed:0,preparing:0});
 const exportedAt=new Date().toISOString();
 const text=buildTranscriptReport(report,exportedAt,'http://localhost:5173');
 assert.equal(text,buildTranscriptReport(report,exportedAt,'http://localhost:5173'));
 assert.equal(Buffer.from(text,'utf8').toString('utf8'),text);
 assert(!text.includes('test@test4test.io') && !text.includes('X-Amz-'));
 for(const recording of report.recordings) assert.equal((await call('get-response-recording-access',{responseId:recording.responseId})).status,200);
 for(const name of ['get-transcript-report','retry-recording-transcript','complete-recording-transcript','dispatch-recording-transcripts']) assert.equal((await call(name,{},false)).status,401);
 assert.equal((await call('complete-recording-transcript',{},false,{'x-worker-secret':'invalid-validation-secret'})).status,401);
 assert.equal((await call('get-transcript-report',{appId:'00000000-0000-4000-8000-000000000000'})).status,404);
 const own=await client.from('recording_transcripts').select('response_id,status'); assert.equal(own.error,null); assert.equal(own.data.length,2);
 assert((await client.rpc('claim_recording_transcripts',{p_limit:1})).error);
 console.log(JSON.stringify({status:'passed',coverage:transcriptCoverage(report.recordings),exportBytes:Buffer.byteLength(text),playbackChecks:2,authenticationChecks:6,rowLevelSecurity:true}));
}finally{ assert.equal((await client.auth.signOut({scope:'local'})).error,null); }
