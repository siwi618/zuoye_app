from datetime import datetime
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.schemas.request import ProfileSummary

QuoteBodyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
AnalysisBodyStr = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)
]
# No "#", "@", brackets or whitespace: they would break「(#tag)」「(@name)」references.
TagNameStr = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=20, pattern=r"^[^#@()（）\s]+$"
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
    # Who changed it last and when, once it has been edited (version 2 on).
    last_editor: ProfileSummary | None = None
    edited_at: datetime | None = None


# device = a #literary device, shared by every work; character = an @character of one work.
TagKind = Literal["device", "character"]


class TagRead(BaseModel):
    id: str
    name: str
    kind: TagKind = "device"
    # Analyses using the tag: in the work asked about, or in all works.
    count: int


# Highlighter colours: yellow, light blue, pink, light green.
HighlightColor = Literal["amber", "sky", "pink", "lime"]


class HighlightIn(BaseModel):
    quote_id: str
    number: int = Field(ge=1, le=99)
    start: int = Field(ge=0)
    end: int = Field(ge=1)
    color: HighlightColor = "amber"


class HighlightRead(HighlightIn):
    pass


class QuoteVersion(BaseModel):
    """One version of a quote. An analysis cites the version it was written on, so a later
    change to the quote leaves it as written; highlights point into this text."""
    id: str
    quote_id: str
    number: int
    body: str
    page_start: int
    page_end: int
    edition: str | None = None


class CitedQuote(BaseModel):
    quote_id: str
    version_id: str


class AnalysisCreate(BaseModel):
    quote_ids: list[str] = Field(min_length=1, max_length=MAX_ANALYSIS_QUOTES)
    highlights: list[HighlightIn] = Field(default_factory=list, max_length=MAX_HIGHLIGHTS)
    tags: list[TagNameStr] = Field(min_length=1, max_length=MAX_ANALYSIS_TAGS)
    characters: list[TagNameStr] = Field(default_factory=list, max_length=MAX_ANALYSIS_TAGS)
    body: AnalysisBodyStr


class AnalysisRead(BaseModel):
    id: str
    work_key: str
    author: ProfileSummary
    body: str
    quote_ids: list[str]
    quotes: list[CitedQuote]
    highlights: list[HighlightRead]
    tags: list[TagRead]
    like_count: int
    liked_by_me: bool
    created_at: datetime


class WorkRead(BaseModel):
    work_key: str
    quotes: list[QuoteRead]
    # Tags used by this work's analyses, most used first.
    tags: list[TagRead]
    # The analyses come a page at a time (AnalysisPage); this is how many there are.
    analysis_count: int


class AnalysisSort(str, Enum):
    hot = "hot"  # most liked first
    new = "new"
    mine = "mine"  # the reader's own on top (newest first), then the rest by likes


class AnalysisPage(BaseModel):
    items: list[AnalysisRead]
    # The quote versions these analyses cite, each sent once.
    versions: list[QuoteVersion]
    total: int  # analyses matching the filters
    next_offset: int | None  # None when this was the last page


class WorkLink(BaseModel):
    work_key: str
    tag_id: str
    count: int


class OverviewRead(BaseModel):
    """The hottest tags (the sphere's core) and how much each work uses them."""
    tags: list[TagRead]
    links: list[WorkLink]


# Introductions anyone can edit: a work's (by its key) or a #device's (by its name).
IntroKind = Literal["work", "device"]
IntroBodyStr = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class IntroUpdate(BaseModel):
    body: IntroBodyStr  # empty clears it (as a version of its own)


class IntroVersion(BaseModel):
    id: str
    number: int
    body: str
    editor: ProfileSummary
    created_at: datetime


class IntroRead(BaseModel):
    kind: IntroKind
    key: str
    current: IntroVersion | None  # None: nobody has written one yet
    version_count: int
