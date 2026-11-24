'use strict'

const ATTEMPTS = 15
const FETCH_TIMEOUT_MS = 5000
const RETRY_DELAY_MS = 2000

function backendIds(token) {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    const scope = String(claims.scp || '').split(' ').find(value => value.startsWith('Actions.Results:'))
    const fields = scope?.split(':')
    if (fields?.length !== 3 || !fields[1] || !fields[2]) throw new Error()
    return { workflowRunBackendId: fields[1], workflowJobRunBackendId: fields[2] }
  } catch {
    throw new Error('Runner artifact-service scope is missing or invalid')
  }
}

async function waitForArtifact({ env = process.env, fetchImpl = fetch,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), log = console.log } = {}) {
  const name = env['INPUT_ARTIFACT-NAME']
  const id = env['INPUT_ARTIFACT-ID']
  if (!/^\d+$/.test(env.GITHUB_RUN_ID || '') || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT || '') ||
      name !== `github-pages-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}` || !/^[1-9]\d*$/.test(id || '')) {
    throw new Error('Expected uploaded Pages artifact name or ID is invalid')
  }
  const token = env.ACTIONS_RUNTIME_TOKEN
  if (!token) throw new Error('Runner artifact-service authentication is unavailable')
  const ids = backendIds(token)
  const body = JSON.stringify({ workflow_run_backend_id: ids.workflowRunBackendId,
    workflow_job_run_backend_id: ids.workflowJobRunBackendId })
  let endpoint
  try {
    const configured = new URL(env.ACTIONS_RESULTS_URL)
    if (configured.protocol !== 'https:' || configured.username || configured.password) throw new Error()
    endpoint = configured.origin + '/twirp/github.actions.results.api.v1.ArtifactService/ListArtifacts'
  } catch {
    throw new Error('Runner artifact-service origin is invalid')
  }
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let data
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      })
      if (response.ok) data = await response.json()
    } catch {
      // Credentials and response bodies stay in memory and never enter logs.
    }
    if (Array.isArray(data?.artifacts)) {
      const matches = data.artifacts.filter(artifact => artifact.name === name)
      if (matches.length > 1) throw new Error('Duplicate artifacts for this exact workflow attempt')
      if (matches.length === 1) {
        const artifact = matches[0]
        const rawId = artifact.database_id ?? artifact.databaseId
        if (!['string', 'number'].includes(typeof rawId) || String(rawId) !== id ||
            (artifact.database_id !== undefined && artifact.databaseId !== undefined &&
              String(artifact.database_id) !== String(artifact.databaseId))) {
          throw new Error('Artifact service ID differs from the completed upload')
        }
        if (Number.isSafeInteger(Number(artifact.size)) && Number(artifact.size) > 0) {
          log(`Pages artifact is visible to the deployment service: ${name} ${id}`)
          return { name, id, attempts: attempt }
        }
      }
    }
    if (attempt === ATTEMPTS) throw new Error('Pages artifact did not become visible to the deployment service within the bounded wait')
    log(`Waiting for deployment-service artifact metadata: ${attempt} / ${ATTEMPTS}`)
    await sleep(RETRY_DELAY_MS)
  }
}

if (require.main === module) {
  waitForArtifact().catch(error => {
    console.error(`::error::${error.message}`)
    process.exitCode = 1
  })
}
module.exports = { waitForArtifact, backendIds, ATTEMPTS, FETCH_TIMEOUT_MS, RETRY_DELAY_MS }
