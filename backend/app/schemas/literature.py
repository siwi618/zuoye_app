from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.schemas.request import ProfileSummary

QuoteBodyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
AnalysisBodyStr = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)
]
# No "#", brackets or whitespace: they would break「(#tag)」references in an analysis.
TagNameStr = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=20, pattern=r"^[^#()（）\s]+$"
    ),
]
WorkKeyStr = Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{1,40}$")]
EditionStr = Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)]

MAX_ANALYSIS_QUOTES = 10
MAX_ANALYSIS_TAGS = 8
MAX_HIGHLIGHTS = 30


class QuoteCreate(BaseModel):
    body: QuoteBodyStr
    page_start: int = Field(ge=1, le=9999)
    page_end: int = Field(ge=1, le=9999)
    # Edition / publisher the page numbers refer to; optional.
    edition: EditionStr | None = None

    @model_validator(mode="after")
    def _pages_in_order(self) -> "QuoteCreate":
        if self.page_end < self.page_start:
            raise ValueError("page_end must not be before page_start")
        self.edition = self.edition or None
        return self


class QuoteRead(BaseModel):
    id: str
    work_key: str
    author: ProfileSummary
    body: str
    page_start: int
    page_end: int
    edition: str | None = None
    # Analyses citing it; a cited quote can no longer be deleted.
    cited_count: int
    created_at: datetime


class TagRead(BaseModel):
    id: str
    name: str
    # Analyses using the tag: in the work asked about, or in all works.
    count: int


class HighlightIn(BaseModel):
    quote_id: str
    number: int = Field(ge=1, le=99)
    start: int = Field(ge=0)
    end: int = Field(ge=1)


class HighlightRead(HighlightIn):
    pass


class CoveredQuote(BaseModel):
    """A quote as it was when the analysis was published; highlights point into this text."""
    quote_id: str
    body: str
    page_start: int
    page_end: int
    edition: str | None = None


class AnalysisCreate(BaseModel):
    quote_ids: list[str] = Field(min_length=1, max_length=MAX_ANALYSIS_QUOTES)
    highlights: list[HighlightIn] = Field(default_factory=list, max_length=MAX_HIGHLIGHTS)
    tags: list[TagNameStr] = Field(min_length=1, max_length=MAX_ANALYSIS_TAGS)
    body: AnalysisBodyStr


class AnalysisRead(BaseModel):
    id: str
    work_key: str
    author: ProfileSummary
    body: str
    quote_ids: list[str]
    quotes: list[CoveredQuote]
    highlights: list[HighlightRead]
    tags: list[TagRead]
    like_count: int
    liked_by_me: bool
    created_at: datetime


class WorkRead(BaseModel):
    work_key: str
    quotes: list[QuoteRead]
    analyses: list[AnalysisRead]
    # Tags used by this work's analyses, most used first.
    tags: list[TagRead]


class WorkLink(BaseModel):
    work_key: str
    tag_id: str
    count: int


class OverviewRead(BaseModel):
    """The hottest tags (the sphere's core) and how much each work uses them."""
    tags: list[TagRead]
    links: list[WorkLink]
