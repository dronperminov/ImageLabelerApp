import os
import json
from typing import List

from label_managers.abstract_label_manager import AbstractLabelManager


class MultipleJsonLabelManager(AbstractLabelManager):
    def __init__(self, labeled_path: str):
        self.labeled_path = labeled_path

    def save_entities(self, filename: str, entities: List[dict]):
        json_path = os.path.join(self.labeled_path, f"{filename}.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump({
                "name": filename,
                "entities": entities
            }, f, indent=4, ensure_ascii=False)

    def get_entities(self, filename: str) -> List[dict]:
        json_path = os.path.join(self.labeled_path, f"{filename}.json")
        if not os.path.exists(json_path):
            return []

        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)

        entities = data['entities']
        return entities
