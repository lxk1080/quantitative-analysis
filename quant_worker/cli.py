from __future__ import annotations

import argparse

from quant_worker.database import apply_migrations, connect, utc_now
from quant_worker.demo import seed_demo_data
from quant_worker.services import rebuild_all_indicators
from quant_worker.worker import process_one_job, run_worker_loop


def main() -> None:
    parser = argparse.ArgumentParser(description="Quantitative analysis Python worker")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("migrate")
    subparsers.add_parser("seed-demo")
    subparsers.add_parser("rebuild-indicators")
    cancel_parser = subparsers.add_parser("cancel-job")
    cancel_parser.add_argument("job_id")
    worker_parser = subparsers.add_parser("worker")
    worker_parser.add_argument("--loop", action="store_true")
    args = parser.parse_args()

    connection = connect()
    try:
        apply_migrations(connection)
        if args.command == "migrate":
            print("database migrations applied")
        elif args.command == "seed-demo":
            print(seed_demo_data(connection))
        elif args.command == "rebuild-indicators":
            print(rebuild_all_indicators(connection))
        elif args.command == "cancel-job":
            result = connection.execute(
                """UPDATE sync_jobs SET status='failed', error_message='Cancelled by operator', finished_at=?
                   WHERE id=? AND status IN ('queued', 'running')""",
                (utc_now(), args.job_id),
            )
            print({"cancelled": result.rowcount})
        elif args.command == "worker":
            if args.loop:
                run_worker_loop(connection)
            else:
                print({"processed": process_one_job(connection)})
    finally:
        connection.close()


if __name__ == "__main__":
    main()
