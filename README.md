## SchedulerManager

SchedulerManager is a NodeJs module to manage job submissions to the Sun Grid Engine (SGE) and the monitoring of submitted jobs.

Several parameters can be configured in order to automatically allow or reject job submission requests. A proper setup of said parameters can be exploited to ensure the system only accepts the requests that do not violate any of the specified constraints. Once a job is submitted to the SGE, the monitoring process takes care of notifying the submitter of the request of any meaningful events, such as the (un)successful completion of a job or the violation of any job-related constraints (i.e. the job has been running/queued for longer than the specified maximum time) and the subsequent deletion of the job.

SchedulerManager includes a library, which adheres to Drmaa standards for the nmost part, used by the module itself to communicate with the SGE, providing a quick and safe way to perform all manners of scheduling operations programmatically instead of resorting to shell commands.


### INSTALLATION

(todo)

### USAGE

Extensive documentation in JSDoc format can be found in the documentation.tar.gz file. A tutorial is also present: it features an explanation of the configuration parameters of the module, a basic example of usage of SchedulerManager and an in-depth explanation of what actually goes on before, during, and after a request is received by the module.
