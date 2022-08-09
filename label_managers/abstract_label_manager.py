import abc
from typing import List


class AbstractLabelManager:
    @abc.abstractmethod
    def get_entities(self, filename: str) -> List[dict]:
        pass

    @abc.abstractmethod
    def save_entities(self, filename: str, entities: List[dict]):
        pass