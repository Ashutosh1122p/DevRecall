# DevRecall API test using PowerShell Invoke-RestMethod.
# Usage: pwsh test_api.ps1 <name>
param([string]$Name = "")

function Invoke-Api {
  param([string]$Method, [string]$Path, [object]$Body)
  $uri = "http://localhost:5000$Path"
  $params = @{ Method = $Method; Uri = $uri; ErrorAction = "Stop" }
  if ($Body) { $params["ContentType"] = "application/json"; $params["Body"] = ($Body | ConvertTo-Json) }
  try { return Invoke-RestMethod @params }
  catch { return [PSCustomObject]@{ __error = $_.Exception.Message } }
}

$tests = @{
  graph_evalx = @{ m="GET"; p="/api/graph?projectName=evalX" }
  graph_devrecall = @{ m="GET"; p="/api/graph?projectName=DevRecall" }
  delete_rel = @{ m="DELETE"; p="/api/relationship"; b=@{ fromId=8; toId=9; type="HAS_TASK"; projectName="evalX" } }
  post_rel_valid = @{ m="POST"; p="/api/relationships"; b=@{ fromId=8; toId=9; type="HAS_TASK"; projectName="evalX" } }
  post_rel_bad_type = @{ m="POST"; p="/api/relationships"; b=@{ fromId=8; toId=9; type="BANANA"; projectName="evalX" } }
  post_rel_bad_source = @{ m="POST"; p="/api/relationships"; b=@{ fromId=13; toId=9; type="MENTIONED"; projectName="evalX" } }
  patch_suresh = @{ m="PATCH"; p="/api/memory/13"; b=@{ projectName="evalX"; updates=@{ name="suresh2" } } }
  patch_suresh_wrongproj = @{ m="PATCH"; p="/api/memory/13"; b=@{ projectName="DevRecall"; updates=@{ name="suresh3" } } }
  patch_missing = @{ m="PATCH"; p="/api/memory/99999"; b=@{ projectName="evalX"; updates=@{ name="x" } } }
  recall = @{ m="GET"; p="/api/recall?projectName=evalX" }
}

if ($Name -and $tests[$Name]) {
  $t = $tests[$Name]
  Invoke-Api -Method $t.m -Path $t.p -Body $t.b
} else {
  foreach ($k in $tests.Keys) { "=== $k ==="; $t = $tests[$k]; Invoke-Api -Method $t.m -Path $t.p -Body $t.b }
}