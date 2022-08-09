import os
import json
from typing import List

from label_managers.abstract_label_manager import AbstractLabelManager


class JsonLabelManager(AbstractLabelManager):
    def __init__(self, labeled_path: str):
        self.labeled_path = labeled_path

    def __get_labeled(self) -> dict:
        labeled_path = os.path.join(self.labeled_path)

        if not os.path.exists(labeled_path):
            return {}

        with open(labeled_path, 'r') as f:
            data = json.load(f)

        return data

    def save_entities(self, filename: str, entities: List[dict]):
        labeled = self.__get_labeled()
        labeled[filename] = entities

        with open(self.labeled_path, 'w') as f:
            json.dump(labeled, f, indent=4, ensure_ascii=False)

    def get_entities(self, filename: str) -> List[dict]:
        labeled = self.__get_labeled()
        return labeled.get(filename, [])
