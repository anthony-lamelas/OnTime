from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.mta.feeds import get_live_subway_data

router = APIRouter()


@router.get("/live")
async def live_subway(line: Optional[str] = Query(None, description="Single subway line letter, e.g. A, 1, G")):
    """Return live MTA subway data from GTFS-RT feeds.

    - **line**: optional filter — returns only the feed group for that line.
      Omit to receive data from all 8 feeds merged together.
    """
    try:
        data = await get_live_subway_data(line)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"MTA feed error: {exc}")
    return data
