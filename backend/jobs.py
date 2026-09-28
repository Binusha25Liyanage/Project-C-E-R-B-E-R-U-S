"""
Generic background job runner. A job keeps running in Python regardless of
which tab is on screen; the frontend polls its status by job_id.
Capped at MAX_WORKERS concurrent jobs on purpose.
"""

from concurrent.futures import ThreadPoolExecutor

MAX_WORKERS = 2


class JobManager:
    def __init__(self, db):
        self.db = db
        self.executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)

    def submit(self, job_type, target_fn, schema_id=None, title=None, args=()):
        job_id = self.db.create_job(job_type, schema_id=schema_id, title=title)

        def progress_cb(progress_dict):
            self.db.update_job(job_id, status="running", progress=progress_dict)

        def _run():
            self.db.update_job(job_id, status="running")
            try:
                result = target_fn(job_id, progress_cb, *args)
                self.db.update_job(job_id, status="completed", result=result)
            except Exception as e:
                self.db.update_job(job_id, status="failed", error=str(e))

        self.executor.submit(_run)
        return job_id
